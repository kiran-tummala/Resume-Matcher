"""Optional sign-in gate for a hosted deployment (Supabase Auth).

Off unless ``AUTH_PROVIDER=supabase``, so local single-user use is unchanged.
When on, every ``/api`` request needs a Supabase access token
(``Authorization: Bearer``), checked locally against the project's signing
keys, from an allowed email address or domain.

One exception: the PDF renderer. Chromium in this process loads the
frontend's print pages, and those server components fetch the resume from this
API without a user session. Both legs carry ``X-Internal-Render`` with
``INTERNAL_RENDER_SECRET``; nothing else is accepted without a token.
"""

import asyncio
import hmac
import json
import logging
import os
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import cached_property
from typing import Any

import jwt
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

RENDER_HEADER = "x-internal-render"
_PUBLIC_PATHS = frozenset({"/api/v1/health"})
_GATED_PREFIXES = ("/api/", "/docs", "/redoc", "/openapi.json")


def _csv(value: str | None) -> frozenset[str]:
    return frozenset(p.strip().lower() for p in (value or "").split(",") if p.strip())


@dataclass(frozen=True)
class AuthSettings:
    provider: str = ""
    supabase_url: str = ""
    jwt_secret: str = ""
    allowed_emails: frozenset[str] = field(default_factory=frozenset)
    allowed_domains: frozenset[str] = field(default_factory=frozenset)
    render_secret: str = ""

    @classmethod
    def from_env(cls) -> "AuthSettings":
        return cls(
            provider=os.environ.get("AUTH_PROVIDER", "").strip().lower(),
            supabase_url=os.environ.get("SUPABASE_URL", "").strip().rstrip("/"),
            jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", "").strip(),
            allowed_emails=_csv(os.environ.get("AUTH_ALLOWED_EMAILS")),
            allowed_domains=_csv(os.environ.get("AUTH_ALLOWED_DOMAINS")),
            render_secret=os.environ.get("INTERNAL_RENDER_SECRET", "").strip(),
        )

    @property
    def enabled(self) -> bool:
        return self.provider == "supabase"

    def validate(self) -> None:
        """Refuse to start half-configured rather than run open."""
        if not self.enabled:
            if self.provider:
                raise RuntimeError(f"Unknown AUTH_PROVIDER {self.provider!r}")
            return
        if not self.supabase_url:
            raise RuntimeError("AUTH_PROVIDER=supabase needs SUPABASE_URL")
        if len(self.render_secret) < 32:
            raise RuntimeError(
                "AUTH_PROVIDER=supabase needs INTERNAL_RENDER_SECRET "
                "(32+ random characters) so PDF export keeps working"
            )
        if not self.allowed_emails and not self.allowed_domains:
            logger.warning(
                "No AUTH_ALLOWED_EMAILS/AUTH_ALLOWED_DOMAINS: every user of the "
                "Supabase project can sign in. Disable public sign-ups there."
            )

    @cached_property
    def issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @cached_property
    def jwks_client(self) -> jwt.PyJWKClient:
        return jwt.PyJWKClient(
            f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600
        )

    def email_allowed(self, email: str | None) -> bool:
        if not self.allowed_emails and not self.allowed_domains:
            return True
        if not email:
            return False
        email = email.strip().lower()
        domain = email.rsplit("@", 1)[-1]
        return email in self.allowed_emails or domain in self.allowed_domains


class InvalidToken(Exception):
    """The bearer token is missing, malformed, expired or not allowed."""


def _signing_key(token: str, auth: AuthSettings) -> Any:
    """HS256 projects use the shared secret; asymmetric ones publish JWKS."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise InvalidToken("malformed token") from e
    if header.get("alg") == "HS256":
        if not auth.jwt_secret:
            raise InvalidToken("HS256 token but no SUPABASE_JWT_SECRET")
        return auth.jwt_secret
    try:
        return auth.jwks_client.get_signing_key_from_jwt(token).key
    except jwt.PyJWTError as e:
        raise InvalidToken("unknown signing key") from e


def verify_token(token: str, auth: AuthSettings) -> dict[str, Any]:
    """Return the verified claims, or raise ``InvalidToken``. Blocking (JWKS fetch)."""
    key = _signing_key(token, auth)
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256", "RS256", "ES256"],
            audience="authenticated",
            issuer=auth.issuer,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise InvalidToken(str(e)) from e
    if not auth.email_allowed(claims.get("email")):
        raise InvalidToken("email not allowed")
    return claims


def _gated(path: str) -> bool:
    return path not in _PUBLIC_PATHS and any(
        path.startswith(p) for p in _GATED_PREFIXES
    )


def _bearer(headers: Headers) -> str | None:
    value = headers.get("authorization", "")
    scheme, _, token = value.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def render_secret_matches(values: Iterable[str], secret: str) -> bool:
    return bool(secret) and any(hmac.compare_digest(v, secret) for v in values)


class AuthMiddleware:
    """ASGI gate in front of the API. A no-op when auth is disabled."""

    def __init__(self, app: ASGIApp, auth: AuthSettings) -> None:
        self.app = app
        self.auth = auth

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            not self.auth.enabled
            or scope["type"] != "http"
            or scope.get("method") == "OPTIONS"
            or not _gated(scope.get("path", ""))
        ):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        if render_secret_matches(
            headers.getlist(RENDER_HEADER), self.auth.render_secret
        ):
            await self.app(scope, receive, send)
            return
        token = _bearer(headers)
        if token is None:
            await self._deny(scope, receive, send, "Sign in required.")
            return
        try:
            claims = await asyncio.to_thread(verify_token, token, self.auth)
        except InvalidToken as e:
            logger.info("Rejected API token: %s", e)
            await self._deny(
                scope, receive, send, "Your session is invalid or expired."
            )
            return
        scope.setdefault("state", {})["user"] = {
            "id": claims["sub"],
            "email": claims.get("email"),
        }
        await self.app(scope, receive, send)

    @staticmethod
    async def _deny(scope: Scope, receive: Receive, send: Send, message: str) -> None:
        response = JSONResponse(
            {"detail": message},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
        await response(scope, receive, send)


def describe(auth: AuthSettings) -> str:
    """Safe one-line summary for the startup log (no secrets)."""
    if not auth.enabled:
        return "auth disabled (local mode)"
    return json.dumps(
        {
            "provider": auth.provider,
            "issuer": auth.issuer,
            "allowed_emails": len(auth.allowed_emails),
            "allowed_domains": sorted(auth.allowed_domains),
        }
    )
