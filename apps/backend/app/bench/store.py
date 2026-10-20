"""Persistence for the staffing bench.

Uses the upstream ``Database`` engines and its single-writer reservation, so the
bench behaves the same on SQLite and PostgreSQL. Rows leave this module as
plain dicts, like the upstream facade.
"""

import hashlib
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.bench.models import Consultant, Requirement, Submission, utcnow_iso
from app.database import Database
from app.models import Resume


class DuplicateSubmissionError(Exception):
    """The consultant was already submitted to this requirement."""

    def __init__(self, existing: dict[str, Any]) -> None:
        super().__init__("Consultant already submitted to this requirement")
        self.existing = existing


def _row_dict(row: Any) -> dict[str, Any]:
    return {c.key: getattr(row, c.key) for c in row.__table__.columns}


_WS = re.compile(r"[^a-z0-9]+")


def requirement_dedupe_key(
    *,
    title: str,
    client: str | None,
    location: str | None,
    external_ref: str | None,
) -> str:
    """Stable key so the same req sent by several vendors is stored once.

    A client's own requisition id wins when present; otherwise the normalised
    client + title + location stands in for it.
    """

    def norm(value: str | None) -> str:
        return _WS.sub(" ", (value or "").lower()).strip()

    if external_ref and client:
        basis = f"ref|{norm(client)}|{norm(external_ref)}"
    else:
        basis = f"txt|{norm(client)}|{norm(title)}|{norm(location)}"
    return hashlib.sha256(basis.encode()).hexdigest()[:32]


class BenchStore:
    """Bench CRUD over one ``Database``."""

    def __init__(self, database: Database) -> None:
        self.database = database

    # -- consultants -----------------------------------------------------

    async def create_consultant(self, **fields: Any) -> dict[str, Any]:
        now = utcnow_iso()
        row = Consultant(
            consultant_id=str(uuid4()), created_at=now, updated_at=now, **fields
        )
        async with self.database._write_session() as session:
            session.add(row)
            await session.commit()
        return _row_dict(row)

    async def list_consultants(self, status: str | None = None) -> list[dict[str, Any]]:
        async with self.database._session() as session:
            stmt = select(Consultant).order_by(Consultant.full_name)
            if status:
                stmt = stmt.where(Consultant.status == status)
            rows = (await session.execute(stmt)).scalars().all()
            return [_row_dict(r) for r in rows]

    async def get_consultant(self, consultant_id: str) -> dict[str, Any] | None:
        async with self.database._session() as session:
            row = await session.get(Consultant, consultant_id)
            return _row_dict(row) if row else None

    async def update_consultant(
        self, consultant_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        async with self.database._write_session() as session:
            row = await session.get(Consultant, consultant_id)
            if row is None:
                return None
            for key, value in updates.items():
                setattr(row, key, value)
            row.updated_at = utcnow_iso()
            await session.commit()
            return _row_dict(row)

    async def delete_consultant(self, consultant_id: str) -> bool:
        """Delete a consultant, their submissions and their resumes."""
        async with self.database._write_session() as session:
            row = await session.get(Consultant, consultant_id)
            if row is None:
                return False
            subs = (
                (
                    await session.execute(
                        select(Submission).where(
                            Submission.consultant_id == consultant_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            resume_ids = {s.tailored_resume_id for s in subs if s.tailored_resume_id}
            if row.resume_id:
                resume_ids.add(row.resume_id)
                children = (
                    (
                        await session.execute(
                            select(Resume.resume_id).where(
                                Resume.parent_id == row.resume_id
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                resume_ids.update(children)
            for sub in subs:
                await session.delete(sub)
            for resume_id in resume_ids:
                resume = await session.get(Resume, resume_id)
                if resume is not None:
                    await session.delete(resume)
            await session.delete(row)
            await session.commit()
            return True

    async def consultant_for_resume(self, resume_id: str) -> dict[str, Any] | None:
        async with self.database._session() as session:
            row = await session.scalar(
                select(Consultant).where(Consultant.resume_id == resume_id)
            )
            return _row_dict(row) if row else None

    async def bench_resume_ids(self) -> set[str]:
        """Every consultant base resume id."""
        async with self.database._session() as session:
            ids = (
                (
                    await session.execute(
                        select(Consultant.resume_id).where(
                            Consultant.resume_id.is_not(None)
                        )
                    )
                )
                .scalars()
                .all()
            )
            return set(ids)

    # -- requirements ----------------------------------------------------

    async def upsert_requirement(self, **fields: Any) -> tuple[dict[str, Any], bool]:
        """Insert a requirement, or return the existing one with the same key.

        Returns ``(row, created)``.
        """
        key = requirement_dedupe_key(
            title=fields["title"],
            client=fields.get("client"),
            location=fields.get("location"),
            external_ref=fields.get("external_ref"),
        )
        async with self.database._write_session() as session:
            existing = await session.scalar(
                select(Requirement).where(Requirement.dedupe_key == key)
            )
            if existing is not None:
                return _row_dict(existing), False
            now = utcnow_iso()
            row = Requirement(
                requirement_id=str(uuid4()),
                dedupe_key=key,
                created_at=now,
                updated_at=now,
                **fields,
            )
            session.add(row)
            await session.commit()
            return _row_dict(row), True

    async def list_requirements(
        self, status: str | None = None
    ) -> list[dict[str, Any]]:
        async with self.database._session() as session:
            stmt = select(Requirement).order_by(Requirement.created_at.desc())
            if status:
                stmt = stmt.where(Requirement.status == status)
            rows = (await session.execute(stmt)).scalars().all()
            return [_row_dict(r) for r in rows]

    async def get_requirement(self, requirement_id: str) -> dict[str, Any] | None:
        async with self.database._session() as session:
            row = await session.get(Requirement, requirement_id)
            return _row_dict(row) if row else None

    async def update_requirement(
        self, requirement_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        async with self.database._write_session() as session:
            row = await session.get(Requirement, requirement_id)
            if row is None:
                return None
            for key, value in updates.items():
                setattr(row, key, value)
            row.updated_at = utcnow_iso()
            await session.commit()
            return _row_dict(row)

    # -- submissions -----------------------------------------------------

    async def create_submission(self, **fields: Any) -> dict[str, Any]:
        """Create a submission; raise ``DuplicateSubmissionError`` for a repeat pair."""
        consultant_id = fields["consultant_id"]
        requirement_id = fields["requirement_id"]

        async def find(session: Any) -> Submission | None:
            return await session.scalar(
                select(Submission).where(
                    Submission.consultant_id == consultant_id,
                    Submission.requirement_id == requirement_id,
                )
            )

        try:
            async with self.database._write_session() as session:
                existing = await find(session)
                if existing is not None:
                    raise DuplicateSubmissionError(_row_dict(existing))
                now = utcnow_iso()
                row = Submission(
                    submission_id=str(uuid4()), created_at=now, updated_at=now, **fields
                )
                session.add(row)
                await session.commit()
                return _row_dict(row)
        except IntegrityError:
            # A concurrent insert won the unique constraint.
            async with self.database._session() as session:
                existing = await find(session)
            if existing is None:
                raise
            raise DuplicateSubmissionError(_row_dict(existing)) from None

    async def get_submission(self, submission_id: str) -> dict[str, Any] | None:
        async with self.database._session() as session:
            row = await session.get(Submission, submission_id)
            return _row_dict(row) if row else None

    async def list_submissions(
        self,
        *,
        consultant_id: str | None = None,
        requirement_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        async with self.database._session() as session:
            stmt = select(Submission).order_by(Submission.updated_at.desc())
            if consultant_id:
                stmt = stmt.where(Submission.consultant_id == consultant_id)
            if requirement_id:
                stmt = stmt.where(Submission.requirement_id == requirement_id)
            if status:
                stmt = stmt.where(Submission.status == status)
            rows = (await session.execute(stmt)).scalars().all()
            return [_row_dict(r) for r in rows]

    async def update_submission(
        self, submission_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        async with self.database._write_session() as session:
            row = await session.get(Submission, submission_id)
            if row is None:
                return None
            for key, value in updates.items():
                setattr(row, key, value)
            if updates.get("status") == "submitted" and row.submitted_at is None:
                row.submitted_at = utcnow_iso()
            row.updated_at = utcnow_iso()
            await session.commit()
            return _row_dict(row)

    async def delete_submission(self, submission_id: str) -> bool:
        async with self.database._write_session() as session:
            row = await session.get(Submission, submission_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True
