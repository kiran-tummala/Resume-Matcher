"""Request/response models for the bench API. Rates are hourly, in dollars."""

from typing import Literal

from pydantic import BaseModel, Field

ConsultantStatus = Literal["bench", "placed", "inactive"]
RequirementStatus = Literal["open", "on_hold", "closed"]
SubmissionStatus = Literal[
    "tailoring",
    "ready",
    "submitted",
    "client_review",
    "interview",
    "offer",
    "placed",
    "rejected",
    "withdrawn",
]

_Rate = Field(default=None, ge=0, le=100_000)


def to_cents(value: float | None) -> int | None:
    """Dollars to integer cents (money is never stored as a float)."""
    return None if value is None else int(round(value * 100))


def from_cents(value: int | None) -> float | None:
    """Integer cents to dollars."""
    return None if value is None else value / 100


class ConsultantCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=50)
    headline: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    work_authorization: str | None = Field(default=None, max_length=100)
    skills: str | None = Field(default=None, max_length=4000)
    pay_rate: float | None = _Rate
    available_from: str | None = Field(default=None, max_length=40)
    status: ConsultantStatus = "bench"
    notes: str | None = Field(default=None, max_length=10_000)


class ConsultantUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=50)
    headline: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    work_authorization: str | None = Field(default=None, max_length=100)
    skills: str | None = Field(default=None, max_length=4000)
    pay_rate: float | None = _Rate
    available_from: str | None = Field(default=None, max_length=40)
    status: ConsultantStatus | None = None
    notes: str | None = Field(default=None, max_length=10_000)


class ConsultantResponse(BaseModel):
    consultant_id: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    headline: str | None = None
    location: str | None = None
    work_authorization: str | None = None
    skills: str | None = None
    pay_rate: float | None = None
    available_from: str | None = None
    status: str
    resume_id: str | None = None
    resume_status: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    client: str | None = Field(default=None, max_length=200)
    vendor: str | None = Field(default=None, max_length=200)
    external_ref: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    bill_rate: float | None = _Rate
    description: str = Field(min_length=1)
    status: RequirementStatus = "open"


class RequirementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    client: str | None = Field(default=None, max_length=200)
    vendor: str | None = Field(default=None, max_length=200)
    external_ref: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    bill_rate: float | None = _Rate
    status: RequirementStatus | None = None


class RequirementResponse(BaseModel):
    requirement_id: str
    title: str
    client: str | None = None
    vendor: str | None = None
    external_ref: str | None = None
    location: str | None = None
    bill_rate: float | None = None
    description: str
    status: str
    created_at: str
    updated_at: str


class RequirementCreateResponse(BaseModel):
    requirement: RequirementResponse
    # False when the same requirement already existed (e.g. a second vendor).
    created: bool


class ConsultantMatch(BaseModel):
    consultant_id: str
    full_name: str
    headline: str | None = None
    status: str
    has_resume: bool
    already_submitted: bool
    score: int
    matched_skills: list[str]
    skill_count: int


class SubmissionCreate(BaseModel):
    consultant_id: str
    requirement_id: str
    bill_rate: float | None = _Rate
    pay_rate: float | None = _Rate
    rtr_confirmed: bool = False
    notes: str | None = Field(default=None, max_length=10_000)


class SubmissionUpdate(BaseModel):
    status: SubmissionStatus | None = None
    bill_rate: float | None = _Rate
    pay_rate: float | None = _Rate
    rtr_confirmed: bool | None = None
    notes: str | None = Field(default=None, max_length=10_000)


class SubmissionResponse(BaseModel):
    submission_id: str
    consultant_id: str
    requirement_id: str
    status: str
    queue_item_id: str | None = None
    tailored_resume_id: str | None = None
    bill_rate: float | None = None
    pay_rate: float | None = None
    margin: float | None = None
    rtr_confirmed: bool
    submitted_at: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str
    consultant_name: str | None = None
    requirement_title: str | None = None
    client: str | None = None
    tailoring_status: str | None = None
    tailoring_error: str | None = None
