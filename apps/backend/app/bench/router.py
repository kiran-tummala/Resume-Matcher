"""Staffing bench endpoints: consultants, requirements, matches and submissions.

Tailoring reuses the upstream sequential queue, so a submission's tailored
resume is produced by the same truth-checked pipeline as everything else.
"""

import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.ai_limits import MAX_JOB_CHARACTERS, PromptSizeError, require_source_size
from app.bench import service
from app.bench.models import SUBMISSION_STATUSES
from app.bench.schemas import (
    ConsultantCreate,
    ConsultantMatch,
    ConsultantResponse,
    ConsultantUpdate,
    RequirementCreate,
    RequirementCreateResponse,
    RequirementResponse,
    RequirementUpdate,
    SubmissionCreate,
    SubmissionResponse,
    SubmissionUpdate,
    from_cents,
    to_cents,
)
from app.bench.store import DuplicateSubmissionError
from app.database import DatabaseBusyError, db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bench", tags=["Staffing Bench"])

# Statuses that mean the profile has actually gone out to a client or vendor.
_SENT_STATUSES = {"submitted", "client_review", "interview", "offer", "placed"}


# -- helpers ---------------------------------------------------------------


async def _consultant_out(row: dict[str, Any]) -> ConsultantResponse:
    resume_status: str | None = None
    if row.get("resume_id"):
        resume = await db.get_resume(row["resume_id"])
        resume_status = (resume or {}).get("processing_status")
    return ConsultantResponse(
        **{k: v for k, v in row.items() if k != "pay_rate_cents"},
        pay_rate=from_cents(row.get("pay_rate_cents")),
        resume_status=resume_status,
    )


def _requirement_out(row: dict[str, Any]) -> RequirementResponse:
    return RequirementResponse(
        **{k: v for k, v in row.items() if k not in ("bill_rate_cents", "dedupe_key")},
        bill_rate=from_cents(row.get("bill_rate_cents")),
    )


async def _sync_tailoring(row: dict[str, Any]) -> dict[str, Any]:
    """Fold the queue item's outcome into a submission still tailoring."""
    if row.get("status") != "tailoring" or not row.get("queue_item_id"):
        return row
    item = await db.get_queue_item(row["queue_item_id"])
    if item is None:
        return row
    if item.get("status") == "completed" and item.get("tailored_resume_id"):
        updated = await service.store().update_submission(
            row["submission_id"],
            {"status": "ready", "tailored_resume_id": item["tailored_resume_id"]},
        )
        return updated or row
    return row


async def _submission_out(
    row: dict[str, Any],
    consultants: dict[str, dict[str, Any]] | None = None,
    requirements: dict[str, dict[str, Any]] | None = None,
) -> SubmissionResponse:
    row = await _sync_tailoring(row)
    bench = service.store()
    consultant = (consultants or {}).get(row["consultant_id"]) or (
        await bench.get_consultant(row["consultant_id"])
    )
    requirement = (requirements or {}).get(row["requirement_id"]) or (
        await bench.get_requirement(row["requirement_id"])
    )
    tailoring_status: str | None = None
    tailoring_error: str | None = None
    if row.get("queue_item_id"):
        item = await db.get_queue_item(row["queue_item_id"])
        if item:
            tailoring_status = item.get("status")
            tailoring_error = item.get("error")
    bill = row.get("bill_rate_cents")
    pay = row.get("pay_rate_cents")
    margin = None
    if bill is not None and pay is not None:
        margin = from_cents(bill - pay)
    return SubmissionResponse(
        **{
            k: v
            for k, v in row.items()
            if k not in ("bill_rate_cents", "pay_rate_cents")
        },
        bill_rate=from_cents(bill),
        pay_rate=from_cents(pay),
        margin=margin,
        consultant_name=(consultant or {}).get("full_name"),
        requirement_title=(requirement or {}).get("title"),
        client=(requirement or {}).get("client"),
        tailoring_status=tailoring_status,
        tailoring_error=tailoring_error,
    )


async def _enqueue_tailoring(
    consultant: dict[str, Any], requirement: dict[str, Any]
) -> str:
    description = requirement["description"].strip()
    require_source_size(description, MAX_JOB_CHARACTERS)
    item_id = str(uuid4())
    await db.create_queue_item(
        item_id=item_id,
        resume_id=consultant["resume_id"],
        job_description=description,
        role=requirement.get("title") or "",
        company=requirement.get("client") or "",
        job_req_id=requirement.get("external_ref") or "",
    )
    from app.services.queue_worker import queue_manager

    queue_manager.notify()
    return item_id


# -- consultants -----------------------------------------------------------


@router.get("/consultants", response_model=list[ConsultantResponse])
async def list_consultants(status: str | None = None) -> list[ConsultantResponse]:
    rows = await service.store().list_consultants(status)
    return [await _consultant_out(r) for r in rows]


@router.post("/consultants", response_model=ConsultantResponse)
async def create_consultant(request: ConsultantCreate) -> ConsultantResponse:
    fields = request.model_dump(exclude={"pay_rate"})
    fields["pay_rate_cents"] = to_cents(request.pay_rate)
    row = await service.store().create_consultant(**fields)
    return await _consultant_out(row)


@router.get("/consultants/{consultant_id}", response_model=ConsultantResponse)
async def get_consultant(consultant_id: str) -> ConsultantResponse:
    row = await service.store().get_consultant(consultant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Consultant not found")
    return await _consultant_out(row)


@router.patch("/consultants/{consultant_id}", response_model=ConsultantResponse)
async def update_consultant(
    consultant_id: str, request: ConsultantUpdate
) -> ConsultantResponse:
    updates = request.model_dump(exclude_unset=True, exclude={"pay_rate"})
    if "pay_rate" in request.model_fields_set:
        updates["pay_rate_cents"] = to_cents(request.pay_rate)
    row = await service.store().update_consultant(consultant_id, updates)
    if row is None:
        raise HTTPException(status_code=404, detail="Consultant not found")
    return await _consultant_out(row)


@router.delete("/consultants/{consultant_id}")
async def delete_consultant(consultant_id: str) -> dict[str, str]:
    if not await service.store().delete_consultant(consultant_id):
        raise HTTPException(status_code=404, detail="Consultant not found")
    return {"message": "Consultant deleted"}


@router.post("/consultants/{consultant_id}/resume", response_model=ConsultantResponse)
async def upload_consultant_resume(
    consultant_id: str, file: UploadFile = File(...)
) -> ConsultantResponse:
    """Upload or replace a consultant's resume and parse it into structured data.

    The resume is stored as a non-master row, so it never counts against the
    master-resume limit or appears on the personal dashboard.
    """
    from app.routers.resumes import _read_upload_content, _validate_upload_type
    from app.services.parser import parse_document, parse_resume_to_json

    bench = service.store()
    consultant = await bench.get_consultant(consultant_id)
    if consultant is None:
        raise HTTPException(status_code=404, detail="Consultant not found")

    _validate_upload_type(file)
    content = await _read_upload_content(file)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        markdown = await parse_document(content, file.filename or "resume.pdf")
    except (DatabaseBusyError, PromptSizeError):
        raise
    except Exception:
        logger.exception("Consultant resume conversion failed")
        raise HTTPException(
            status_code=422,
            detail="Failed to read the document. Please upload a text-based PDF or DOCX.",
        )
    if not markdown or not markdown.strip():
        raise HTTPException(
            status_code=422,
            detail="No text found in the document. It may be scanned; run OCR first.",
        )
    require_source_size(markdown)

    resume_id = consultant.get("resume_id")
    if resume_id and await db.get_resume(resume_id):
        await db.update_resume(
            resume_id,
            {
                "content": markdown,
                "content_type": "md",
                "filename": file.filename,
                "original_markdown": markdown,
                "processing_status": "processing",
            },
        )
    else:
        resume = await db.create_resume(
            content=markdown,
            content_type="md",
            filename=file.filename,
            is_master=False,
            processing_status="processing",
            original_markdown=markdown,
            title=consultant["full_name"],
        )
        resume_id = resume["resume_id"]
        await bench.update_consultant(consultant_id, {"resume_id": resume_id})

    token = await db.claim_resume_processing(resume_id)
    if token is not None:
        try:
            processed = await parse_resume_to_json(markdown)
        except (DatabaseBusyError, PromptSizeError):
            await db.finish_resume_processing(
                resume_id, token, processing_status="failed"
            )
            raise
        except Exception as e:
            logger.warning("Consultant resume parse failed: %s", e)
            await db.finish_resume_processing(
                resume_id, token, processing_status="failed"
            )
        else:
            await db.finish_resume_processing(
                resume_id, token, processing_status="ready", processed_data=processed
            )

    row = await bench.get_consultant(consultant_id)
    assert row is not None
    return await _consultant_out(row)


# -- requirements ----------------------------------------------------------


@router.get("/requirements", response_model=list[RequirementResponse])
async def list_requirements(status: str | None = None) -> list[RequirementResponse]:
    rows = await service.store().list_requirements(status)
    return [_requirement_out(r) for r in rows]


@router.post("/requirements", response_model=RequirementCreateResponse)
async def create_requirement(request: RequirementCreate) -> RequirementCreateResponse:
    """Add a requirement. The same req from a second vendor returns the first."""
    require_source_size(request.description.strip(), MAX_JOB_CHARACTERS)
    fields = request.model_dump(exclude={"bill_rate"})
    fields["description"] = request.description.strip()
    fields["bill_rate_cents"] = to_cents(request.bill_rate)
    row, created = await service.store().upsert_requirement(**fields)
    return RequirementCreateResponse(requirement=_requirement_out(row), created=created)


@router.get("/requirements/{requirement_id}", response_model=RequirementResponse)
async def get_requirement(requirement_id: str) -> RequirementResponse:
    row = await service.store().get_requirement(requirement_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return _requirement_out(row)


@router.patch("/requirements/{requirement_id}", response_model=RequirementResponse)
async def update_requirement(
    requirement_id: str, request: RequirementUpdate
) -> RequirementResponse:
    updates = request.model_dump(exclude_unset=True, exclude={"bill_rate"})
    if "bill_rate" in request.model_fields_set:
        updates["bill_rate_cents"] = to_cents(request.bill_rate)
    row = await service.store().update_requirement(requirement_id, updates)
    if row is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return _requirement_out(row)


@router.get(
    "/requirements/{requirement_id}/matches", response_model=list[ConsultantMatch]
)
async def match_requirement(
    requirement_id: str, include_placed: bool = Query(False)
) -> list[ConsultantMatch]:
    """Rank the bench for a requirement by listed-skill overlap (no AI call)."""
    bench = service.store()
    requirement = await bench.get_requirement(requirement_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    submitted = {
        s["consultant_id"]
        for s in await bench.list_submissions(requirement_id=requirement_id)
    }
    matches: list[ConsultantMatch] = []
    for consultant in await bench.list_consultants():
        if consultant["status"] == "inactive":
            continue
        if consultant["status"] == "placed" and not include_placed:
            continue
        result = service.score_consultant(consultant, requirement)
        matches.append(
            ConsultantMatch(
                consultant_id=consultant["consultant_id"],
                full_name=consultant["full_name"],
                headline=consultant.get("headline"),
                status=consultant["status"],
                has_resume=bool(consultant.get("resume_id")),
                already_submitted=consultant["consultant_id"] in submitted,
                **result,
            )
        )
    matches.sort(key=lambda m: (-m.score, m.full_name.lower()))
    return matches


# -- submissions -----------------------------------------------------------


@router.get("/submissions", response_model=list[SubmissionResponse])
async def list_submissions(
    consultant_id: str | None = None,
    requirement_id: str | None = None,
    status: str | None = None,
) -> list[SubmissionResponse]:
    bench = service.store()
    rows = await bench.list_submissions(
        consultant_id=consultant_id, requirement_id=requirement_id, status=status
    )
    consultants = {c["consultant_id"]: c for c in await bench.list_consultants()}
    requirements = {r["requirement_id"]: r for r in await bench.list_requirements()}
    return [await _submission_out(r, consultants, requirements) for r in rows]


@router.post("/submissions", response_model=SubmissionResponse)
async def create_submission(request: SubmissionCreate) -> SubmissionResponse:
    """Put a consultant forward for a requirement and queue a tailored resume.

    409 if this consultant was already put forward for this requirement.
    """
    bench = service.store()
    consultant = await bench.get_consultant(request.consultant_id)
    if consultant is None:
        raise HTTPException(status_code=404, detail="Consultant not found")
    requirement = await bench.get_requirement(request.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    resume = (
        await db.get_resume(consultant["resume_id"])
        if consultant.get("resume_id")
        else None
    )
    if not resume or resume.get("processing_status") != "ready":
        raise HTTPException(
            status_code=409,
            detail="Upload and parse this consultant's resume before submitting them.",
        )
    try:
        row = await bench.create_submission(
            consultant_id=request.consultant_id,
            requirement_id=request.requirement_id,
            status="tailoring",
            bill_rate_cents=to_cents(
                request.bill_rate
                if request.bill_rate is not None
                else from_cents(requirement.get("bill_rate_cents"))
            ),
            pay_rate_cents=to_cents(
                request.pay_rate
                if request.pay_rate is not None
                else from_cents(consultant.get("pay_rate_cents"))
            ),
            rtr_confirmed=request.rtr_confirmed,
            notes=request.notes,
        )
    except DuplicateSubmissionError as e:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This consultant was already submitted to this requirement.",
                "submission_id": e.existing["submission_id"],
            },
        ) from e
    try:
        item_id = await _enqueue_tailoring(consultant, requirement)
    except Exception:
        await bench.delete_submission(row["submission_id"])
        raise
    row = await bench.update_submission(
        row["submission_id"], {"queue_item_id": item_id}
    )
    assert row is not None
    return await _submission_out(row)


@router.patch("/submissions/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    submission_id: str, request: SubmissionUpdate
) -> SubmissionResponse:
    bench = service.store()
    current = await bench.get_submission(submission_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    current = await _sync_tailoring(current)
    updates = request.model_dump(exclude_unset=True, exclude={"bill_rate", "pay_rate"})
    if "bill_rate" in request.model_fields_set:
        updates["bill_rate_cents"] = to_cents(request.bill_rate)
    if "pay_rate" in request.model_fields_set:
        updates["pay_rate_cents"] = to_cents(request.pay_rate)
    new_status = updates.get("status")
    if new_status is not None:
        if new_status not in SUBMISSION_STATUSES:
            raise HTTPException(status_code=422, detail="Unknown status")
        if new_status in _SENT_STATUSES:
            rtr = updates.get("rtr_confirmed", current.get("rtr_confirmed"))
            if not rtr:
                raise HTTPException(
                    status_code=409,
                    detail="Confirm the consultant's right to represent before submitting.",
                )
            if not current.get("tailored_resume_id"):
                raise HTTPException(
                    status_code=409,
                    detail="The tailored resume is not ready yet.",
                )
    row = await bench.update_submission(submission_id, updates)
    assert row is not None
    return await _submission_out(row)


@router.post(
    "/submissions/{submission_id}/retry-tailoring", response_model=SubmissionResponse
)
async def retry_tailoring(submission_id: str) -> SubmissionResponse:
    bench = service.store()
    row = await bench.get_submission(submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if row.get("tailored_resume_id"):
        raise HTTPException(status_code=409, detail="Tailoring already finished.")
    item = (
        await db.get_queue_item(row["queue_item_id"])
        if row.get("queue_item_id")
        else None
    )
    if item and item.get("status") in ("pending", "processing"):
        raise HTTPException(status_code=409, detail="Tailoring is still running.")
    consultant = await bench.get_consultant(row["consultant_id"])
    requirement = await bench.get_requirement(row["requirement_id"])
    if consultant is None or requirement is None:
        raise HTTPException(status_code=404, detail="Consultant or requirement missing")
    item_id = await _enqueue_tailoring(consultant, requirement)
    updated = await bench.update_submission(
        submission_id, {"queue_item_id": item_id, "status": "tailoring"}
    )
    assert updated is not None
    return await _submission_out(updated)


@router.delete("/submissions/{submission_id}")
async def delete_submission(submission_id: str) -> dict[str, str]:
    if not await service.store().delete_submission(submission_id):
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"message": "Submission deleted"}
