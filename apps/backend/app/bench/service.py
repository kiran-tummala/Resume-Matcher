"""Bench logic shared by the bench router and the upstream resume pipeline."""

import re
from typing import Any

from app.bench.store import BenchStore
from app.database import db

_SPLIT = re.compile(r"[,;\n|/]+")


def store() -> BenchStore:
    """A store over the current global database (tests swap this module's ``db``)."""
    return BenchStore(db)


async def bench_root_resume(resume: dict[str, Any]) -> dict[str, Any] | None:
    """The consultant base resume a resume belongs to, or ``None`` if not bench.

    A consultant's own resume is its root; a tailored copy's root is its parent.
    Upstream grounds tailoring in the *default master* for any non-master
    resume, which on a bench would check consultant A against someone else's
    history. Callers use this root as the truth source instead.
    """
    bench = store()
    resume_id = resume.get("resume_id")
    if resume_id and await bench.consultant_for_resume(resume_id):
        return resume
    parent_id = resume.get("parent_id")
    if parent_id and await bench.consultant_for_resume(parent_id):
        return await db.get_resume(parent_id)
    return None


async def is_bench_resume_id(resume_id: str | None) -> bool:
    """True when the id is a consultant base resume."""
    if not resume_id:
        return False
    return await store().consultant_for_resume(resume_id) is not None


def parse_skills(raw: str | None) -> list[str]:
    """Split a free-text skills field into distinct, trimmed skills."""
    seen: dict[str, str] = {}
    for part in _SPLIT.split(raw or ""):
        skill = part.strip()
        if skill and skill.lower() not in seen:
            seen[skill.lower()] = skill
    return list(seen.values())


def _contains(haystack: str, needle: str) -> bool:
    """Whole-term, case-insensitive match (so "Go" does not match "Google")."""
    pattern = r"(?<![A-Za-z0-9+#])" + re.escape(needle.lower()) + r"(?![A-Za-z0-9+#])"
    return re.search(pattern, haystack) is not None


def score_consultant(
    consultant: dict[str, Any], requirement: dict[str, Any]
) -> dict[str, Any]:
    """Keyword overlap between a consultant's listed skills and a requirement.

    Deterministic and free (no LLM): the share of the consultant's skills the
    requirement mentions, plus a headline-title bonus. It ranks the bench for a
    recruiter to review; it is not a judgement of fit.
    """
    text = (
        f"{requirement.get('title', '')}\n{requirement.get('description', '')}".lower()
    )
    skills = parse_skills(consultant.get("skills"))
    matched = [s for s in skills if _contains(text, s)]
    score = round(100 * len(matched) / len(skills)) if skills else 0
    headline = (consultant.get("headline") or "").lower()
    title = (requirement.get("title") or "").lower()
    title_words = {w for w in re.findall(r"[a-z0-9+#]+", title) if len(w) > 2}
    if title_words and title_words & set(re.findall(r"[a-z0-9+#]+", headline)):
        score = min(100, score + 10)
    return {"score": score, "matched_skills": matched, "skill_count": len(skills)}
