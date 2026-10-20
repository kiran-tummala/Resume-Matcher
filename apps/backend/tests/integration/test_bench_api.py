"""Staffing bench API against the real per-test database, LLM stubbed."""

import copy
import json
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app
from app.services.queue_worker import QueueManager

PARSED = {
    "personalInfo": {"name": "Priya Raman", "email": "priya@example.com"},
    "summary": "Platform engineer.",
    "workExperience": [{"title": "DevOps Engineer", "company": "Acme"}],
}
OTHER_PERSON = {
    "personalInfo": {"name": "Default Master Owner"},
    "summary": "Someone else entirely.",
}
JD = "Senior DevOps Engineer. Must have Terraform, Kubernetes and AWS. Go a plus."


@pytest.fixture
async def client(isolated_db: Database) -> AsyncIterator[AsyncClient]:
    del isolated_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
def stub_llm() -> Any:
    with (
        patch(
            "app.services.parser.parse_document",
            new_callable=AsyncMock,
            return_value="# Priya Raman\nDevOps Engineer at Acme",
        ),
        patch(
            "app.services.parser.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=PARSED,
        ),
    ):
        yield


@pytest.fixture
def stub_pipeline(monkeypatch: pytest.MonkeyPatch, isolated_db: Database) -> list[str]:
    """Tailoring creates a real child resume of the consultant resume."""
    calls: list[str] = []

    async def tailor(*, resume_id: str, job_id: str, prompt_id: str | None) -> tuple:
        del job_id, prompt_id
        calls.append(resume_id)
        child = await isolated_db.create_resume(
            content=json.dumps(PARSED),
            content_type="json",
            parent_id=resume_id,
            processing_status="ready",
            processed_data=PARSED,
            title="Tailored",
        )
        return (child, {}, [], "", {})

    monkeypatch.setattr("app.routers.resumes.execute_tailoring_pipeline", tailor)

    async def no_wait(self: QueueManager, seconds: float) -> None:
        del self, seconds

    monkeypatch.setattr(QueueManager, "_cooldown", no_wait)
    return calls


async def _consultant(client: AsyncClient, **extra: Any) -> dict[str, Any]:
    body = {
        "full_name": "Priya Raman",
        "headline": "Senior DevOps Engineer",
        "skills": "Terraform, Kubernetes, AWS, Python",
        "pay_rate": 70,
        **extra,
    }
    resp = await client.post("/api/v1/bench/consultants", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _upload(client: AsyncClient, consultant_id: str) -> dict[str, Any]:
    resp = await client.post(
        f"/api/v1/bench/consultants/{consultant_id}/resume",
        files={"file": ("priya.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _requirement(client: AsyncClient, **extra: Any) -> dict[str, Any]:
    body = {
        "title": "Senior DevOps Engineer",
        "client": "Globex",
        "vendor": "Prime A",
        "external_ref": "REQ-77",
        "bill_rate": 95,
        "description": JD,
        **extra,
    }
    resp = await client.post("/api/v1/bench/requirements", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestConsultantResumes:
    async def test_upload_creates_a_parsed_non_master_resume(
        self, client: AsyncClient, isolated_db: Database, stub_llm: Any
    ) -> None:
        consultant = await _consultant(client)
        updated = await _upload(client, consultant["consultant_id"])
        assert updated["resume_status"] == "ready"
        resume = await isolated_db.get_resume(updated["resume_id"])
        assert resume is not None
        assert resume["is_master"] is False
        assert resume["processed_data"] == PARSED
        assert await isolated_db.list_master_resumes() == []

    async def test_reupload_replaces_the_same_resume_row(
        self, client: AsyncClient, stub_llm: Any
    ) -> None:
        consultant = await _consultant(client)
        first = await _upload(client, consultant["consultant_id"])
        second = await _upload(client, consultant["consultant_id"])
        assert first["resume_id"] == second["resume_id"]

    async def test_bench_resumes_stay_off_the_personal_dashboard(
        self, client: AsyncClient, isolated_db: Database, stub_llm: Any
    ) -> None:
        mine = await isolated_db.create_resume(
            content="mine", processing_status="ready"
        )
        consultant = await _consultant(client)
        await _upload(client, consultant["consultant_id"])
        resp = await client.get("/api/v1/resumes/list")
        ids = [r["resume_id"] for r in resp.json()["data"]]
        assert ids == [mine["resume_id"]]

    async def test_many_consultants_do_not_hit_the_master_limit(
        self, client: AsyncClient, stub_llm: Any
    ) -> None:
        for n in range(7):
            consultant = await _consultant(client, full_name=f"Consultant {n}")
            assert (await _upload(client, consultant["consultant_id"]))[
                "resume_status"
            ] == "ready"


class TestRequirements:
    async def test_same_req_from_a_second_vendor_is_not_duplicated(
        self, client: AsyncClient
    ) -> None:
        first = await _requirement(client)
        second = await _requirement(client, vendor="Prime B")
        assert first["created"] is True
        assert second["created"] is False
        assert (
            second["requirement"]["requirement_id"]
            == first["requirement"]["requirement_id"]
        )
        assert len((await client.get("/api/v1/bench/requirements")).json()) == 1

    async def test_matches_rank_by_listed_skills_whole_terms_only(
        self, client: AsyncClient
    ) -> None:
        await _consultant(client)  # Terraform, Kubernetes, AWS, Python -> 3 of 4
        await _consultant(
            client, full_name="Google Fan", headline="Analyst", skills="Google, Excel"
        )
        await _consultant(
            client, full_name="Gopher", headline="Backend", skills="Go, Rust"
        )
        req = (await _requirement(client))["requirement"]
        resp = await client.get(
            f"/api/v1/bench/requirements/{req['requirement_id']}/matches"
        )
        ranked = resp.json()
        assert [m["full_name"] for m in ranked] == [
            "Priya Raman",
            "Gopher",
            "Google Fan",
        ]
        assert ranked[0]["matched_skills"] == ["Terraform", "Kubernetes", "AWS"]
        assert ranked[0]["score"] == 85  # 75 + 10 headline/title overlap
        assert ranked[1]["matched_skills"] == ["Go"]
        assert ranked[2]["matched_skills"] == []


class TestSubmissions:
    async def test_needs_a_parsed_resume_first(self, client: AsyncClient) -> None:
        consultant = await _consultant(client)
        req = (await _requirement(client))["requirement"]
        resp = await client.post(
            "/api/v1/bench/submissions",
            json={
                "consultant_id": consultant["consultant_id"],
                "requirement_id": req["requirement_id"],
            },
        )
        assert resp.status_code == 409

    async def test_full_flow_tailor_rtr_submit_and_duplicate_guard(
        self,
        client: AsyncClient,
        isolated_db: Database,
        stub_llm: Any,
        stub_pipeline: list[str],
    ) -> None:
        consultant = await _upload(client, (await _consultant(client))["consultant_id"])
        req = (await _requirement(client))["requirement"]
        payload = {
            "consultant_id": consultant["consultant_id"],
            "requirement_id": req["requirement_id"],
        }
        created = await client.post("/api/v1/bench/submissions", json=payload)
        assert created.status_code == 200, created.text
        sub = created.json()
        assert sub["status"] == "tailoring"
        assert (sub["bill_rate"], sub["pay_rate"], sub["margin"]) == (95, 70, 25)

        await QueueManager().drain()
        assert stub_pipeline == [consultant["resume_id"]]

        listed = (await client.get("/api/v1/bench/submissions")).json()
        assert listed[0]["status"] == "ready"
        tailored_id = listed[0]["tailored_resume_id"]
        tailored = await isolated_db.get_resume(tailored_id)
        assert tailored is not None and tailored["parent_id"] == consultant["resume_id"]

        sid = sub["submission_id"]
        blocked = await client.patch(
            f"/api/v1/bench/submissions/{sid}", json={"status": "submitted"}
        )
        assert blocked.status_code == 409
        ok = await client.patch(
            f"/api/v1/bench/submissions/{sid}",
            json={"status": "submitted", "rtr_confirmed": True},
        )
        assert ok.status_code == 200
        assert ok.json()["submitted_at"]

        dup = await client.post("/api/v1/bench/submissions", json=payload)
        assert dup.status_code == 409
        assert dup.json()["detail"]["submission_id"] == sid

        # Consultant tailorings never drop cards on the personal tracker.
        assert await isolated_db.list_applications() == []

    async def test_cannot_submit_before_tailoring_finishes(
        self, client: AsyncClient, stub_llm: Any
    ) -> None:
        consultant = await _upload(client, (await _consultant(client))["consultant_id"])
        req = (await _requirement(client))["requirement"]
        sub = (
            await client.post(
                "/api/v1/bench/submissions",
                json={
                    "consultant_id": consultant["consultant_id"],
                    "requirement_id": req["requirement_id"],
                    "rtr_confirmed": True,
                },
            )
        ).json()
        resp = await client.patch(
            f"/api/v1/bench/submissions/{sub['submission_id']}",
            json={"status": "submitted"},
        )
        assert resp.status_code == 409


class TestGrounding:
    async def test_consultant_tailoring_is_checked_against_their_own_resume(
        self, client: AsyncClient, isolated_db: Database, stub_llm: Any
    ) -> None:
        from app.routers.resumes import _grounding_master_data

        await isolated_db.create_resume(
            content=json.dumps(OTHER_PERSON),
            content_type="json",
            is_master=True,
            is_default_master=True,
            processed_data=OTHER_PERSON,
            processing_status="ready",
        )
        consultant = await _upload(client, (await _consultant(client))["consultant_id"])
        base = await isolated_db.get_resume(consultant["resume_id"])
        child = await isolated_db.create_resume(
            content="{}",
            content_type="json",
            parent_id=consultant["resume_id"],
            processed_data={},
            processing_status="ready",
        )
        assert base is not None
        assert (await _grounding_master_data(base))["personalInfo"]["name"] == (
            "Priya Raman"
        )
        assert (await _grounding_master_data(child))["personalInfo"]["name"] == (
            "Priya Raman"
        )

    async def test_personal_resumes_still_ground_in_the_default_master(
        self, isolated_db: Database
    ) -> None:
        from app.routers.resumes import _grounding_master_data

        await isolated_db.create_resume(
            content=json.dumps(OTHER_PERSON),
            content_type="json",
            is_master=True,
            is_default_master=True,
            processed_data=OTHER_PERSON,
            processing_status="ready",
        )
        orphan = await isolated_db.create_resume(
            content="{}",
            content_type="json",
            processed_data={},
            processing_status="ready",
        )
        grounded = await _grounding_master_data(orphan)
        assert grounded["personalInfo"]["name"] == "Default Master Owner"


async def test_deleting_a_consultant_removes_their_resumes_and_submissions(
    client: AsyncClient,
    isolated_db: Database,
    stub_llm: Any,
    stub_pipeline: list[str],
) -> None:
    consultant = await _upload(client, (await _consultant(client))["consultant_id"])
    req = (await _requirement(client))["requirement"]
    await client.post(
        "/api/v1/bench/submissions",
        json={
            "consultant_id": consultant["consultant_id"],
            "requirement_id": req["requirement_id"],
        },
    )
    await QueueManager().drain()
    await client.get("/api/v1/bench/submissions")  # folds the tailored id in
    resp = await client.delete(
        f"/api/v1/bench/consultants/{consultant['consultant_id']}"
    )
    assert resp.status_code == 200
    assert await isolated_db.get_resume(consultant["resume_id"]) is None
    assert await isolated_db.list_resumes() == []
    assert (await client.get("/api/v1/bench/submissions")).json() == []


async def test_tracker_autocreate_skips_bench_but_keeps_personal_cards(
    client: AsyncClient, isolated_db: Database, stub_llm: Any
) -> None:
    from app.routers.resumes import _auto_create_tracker_application

    consultant = await _upload(client, (await _consultant(client))["consultant_id"])
    await _auto_create_tracker_application(
        job_id="job-bench",
        tailored_resume_id="tailored-bench",
        master_resume_id=consultant["resume_id"],
        job={"company": "Globex"},
        title="Bench tailoring",
    )
    await _auto_create_tracker_application(
        job_id="job-mine",
        tailored_resume_id="tailored-mine",
        master_resume_id="my-master",
        job={"company": "Initech"},
        title="My tailoring",
    )
    cards = await isolated_db.list_applications()
    assert [c["job_id"] for c in cards] == ["job-mine"]


async def test_real_pipeline_tailors_from_the_consultants_own_history(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The real queue + tailoring pipeline (only LLM calls faked) on a bench resume.

    A *different person's* default master exists. Refinement must be grounded in
    the consultant, the tailored copy must carry the consultant's identity, and
    no personal tracker card may appear.
    """
    from types import SimpleNamespace

    from app.schemas.models import ResumeData

    other = copy.deepcopy(sample_resume)
    other["personalInfo"].update(name="Default Master Owner", email="owner@vks.test")
    await isolated_db.create_resume(
        content=json.dumps(other),
        content_type="json",
        is_master=True,
        is_default_master=True,
        processed_data=other,
        processing_status="ready",
    )

    with (
        patch(
            "app.services.parser.parse_document",
            new_callable=AsyncMock,
            return_value="# Jane Doe\nSenior Backend Engineer",
        ),
        patch(
            "app.services.parser.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=copy.deepcopy(sample_resume),
        ),
    ):
        consultant = await _upload(client, (await _consultant(client))["consultant_id"])
    req = (await _requirement(client))["requirement"]
    sub = (
        await client.post(
            "/api/v1/bench/submissions",
            json={
                "consultant_id": consultant["consultant_id"],
                "requirement_id": req["requirement_id"],
            },
        )
    ).json()

    improved = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    improved["summary"] = "Platform engineer focused on Terraform, Kubernetes and AWS."
    grounded_in: list[str] = []

    async def capture_refine(**kwargs: Any) -> Any:
        grounded_in.append(kwargs["master_resume"]["personalInfo"]["name"])
        raise RuntimeError("refinement disabled for test")

    async def no_wait(self: QueueManager, seconds: float) -> None:
        del self, seconds

    monkeypatch.setattr(QueueManager, "_cooldown", no_wait)
    with (
        patch(
            "app.routers.resumes.extract_job_keywords",
            new_callable=AsyncMock,
            return_value={
                "keywords": ["Terraform", "Kubernetes"],
                "required_skills": [],
            },
        ),
        patch(
            "app.routers.resumes.generate_skill_target_plan",
            new_callable=AsyncMock,
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.verify_skill_target_plan",
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.generate_resume_diffs",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(changes=[]),
        ),
        patch(
            "app.routers.resumes.apply_diffs",
            return_value=(copy.deepcopy(improved), [], []),
        ),
        patch("app.routers.resumes.verify_diff_result", return_value=[]),
        patch("app.routers.resumes.refine_resume", side_effect=capture_refine),
        patch(
            "app.routers.resumes.generate_resume_title",
            new_callable=AsyncMock,
            return_value="Jane Doe - Globex",
        ),
    ):
        await QueueManager().drain()

    item = await isolated_db.get_queue_item(sub["queue_item_id"])
    assert item is not None and item["status"] == "completed", item
    assert grounded_in == ["Jane Doe"]

    listed = (await client.get("/api/v1/bench/submissions")).json()
    assert listed[0]["status"] == "ready"
    tailored = await isolated_db.get_resume(listed[0]["tailored_resume_id"])
    assert tailored is not None
    assert tailored["parent_id"] == consultant["resume_id"]
    assert tailored["processed_data"]["personalInfo"]["name"] == "Jane Doe"
    assert await isolated_db.list_applications() == []
