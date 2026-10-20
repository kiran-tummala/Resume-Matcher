"""ORM models for the staffing bench: consultants, requirements and submissions.

These share ``app.models.Base`` so ``init_models_sync`` creates them alongside the
upstream tables (SQLite or PostgreSQL). Timestamps are ISO strings and ids are
uuid strings, matching the upstream conventions.

A consultant's resume is an ordinary *non-master* ``resumes`` row, so the bench
never counts against ``MAX_MASTER_RESUMES``; tailored copies point at it through
``resumes.parent_id`` exactly like upstream tailored resumes point at a master.
"""

from datetime import datetime, timezone

from sqlalchemy import Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base

CONSULTANT_STATUSES: tuple[str, ...] = ("bench", "placed", "inactive")
REQUIREMENT_STATUSES: tuple[str, ...] = ("open", "on_hold", "closed")
SUBMISSION_STATUSES: tuple[str, ...] = (
    "tailoring",
    "ready",
    "submitted",
    "client_review",
    "interview",
    "offer",
    "placed",
    "rejected",
    "withdrawn",
)


def utcnow_iso() -> str:
    """Current UTC time as ISO-8601 (the upstream timestamp format)."""
    return datetime.now(timezone.utc).isoformat()


class Consultant(Base):
    """A person on the bench whom the firm represents."""

    __tablename__ = "bench_consultants"

    consultant_id: Mapped[str] = mapped_column(String, primary_key=True)
    full_name: Mapped[str] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    headline: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    # Free text the recruiter records as the consultant states it.
    work_authorization: Mapped[str | None] = mapped_column(String, nullable=True)
    skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    pay_rate_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_from: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="bench", index=True)
    # The consultant's base resume (a non-master ``resumes`` row).
    resume_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String, default=utcnow_iso)


class Requirement(Base):
    """An open role from a client, prime vendor or job board."""

    __tablename__ = "bench_requirements"
    __table_args__ = (
        # The same req re-sent by two vendors collapses to one row.
        UniqueConstraint("dedupe_key", name="uq_bench_requirement_dedupe"),
        Index("ix_bench_requirement_status", "status", "created_at"),
    )

    requirement_id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    client: Mapped[str | None] = mapped_column(String, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    bill_rate_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text)
    dedupe_key: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[str] = mapped_column(String, default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String, default=utcnow_iso)


class Submission(Base):
    """One consultant put forward for one requirement."""

    __tablename__ = "bench_submissions"
    __table_args__ = (
        # Never submit the same consultant to the same requirement twice.
        UniqueConstraint(
            "consultant_id", "requirement_id", name="uq_bench_submission_pair"
        ),
    )

    submission_id: Mapped[str] = mapped_column(String, primary_key=True)
    consultant_id: Mapped[str] = mapped_column(String, index=True)
    requirement_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="tailoring", index=True)
    # Upstream tailoring queue item and the tailored resume it produced.
    queue_item_id: Mapped[str | None] = mapped_column(String, nullable=True)
    tailored_resume_id: Mapped[str | None] = mapped_column(String, nullable=True)
    bill_rate_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pay_rate_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Right to represent: the consultant agreed to be submitted for this role.
    rtr_confirmed: Mapped[bool] = mapped_column(default=False)
    submitted_at: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default=utcnow_iso)
    updated_at: Mapped[str] = mapped_column(String, default=utcnow_iso)
