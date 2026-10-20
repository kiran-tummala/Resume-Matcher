"""The optional Supabase sign-in gate (no network: HS256 and an in-memory JWKS)."""

import time
from typing import Any
from unittest.mock import MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.auth import RENDER_HEADER, AuthMiddleware, AuthSettings

SUPABASE = "https://proj.supabase.co"
SECRET = "s" * 40
RENDER = "r" * 40


def _settings(**overrides: Any) -> AuthSettings:
    base: dict[str, Any] = dict(
        provider="supabase",
        supabase_url=SUPABASE,
        jwt_secret=SECRET,
        allowed_domains=frozenset({"vkstech.com"}),
        render_secret=RENDER,
    )
    base.update(overrides)
    return AuthSettings(**base)


def _token(key: Any = SECRET, alg: str = "HS256", **claims: Any) -> str:
    payload = {
        "sub": "user-1",
        "email": "kiran@vkstech.com",
        "aud": "authenticated",
        "iss": f"{SUPABASE}/auth/v1",
        "exp": int(time.time()) + 300,
        **claims,
    }
    return jwt.encode(payload, key, algorithm=alg, headers={"kid": "k1"})


def _app(auth: AuthSettings) -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/api/v1/bench/consultants")
    async def data() -> list[str]:
        return ["secret data"]

    app.add_middleware(AuthMiddleware, auth=auth)
    return app


async def _get(auth: AuthSettings, path: str, **headers: str) -> int:
    async with AsyncClient(
        transport=ASGITransport(app=_app(auth)), base_url="http://t"
    ) as client:
        return (await client.get(path, headers=headers)).status_code


PATH = "/api/v1/bench/consultants"


async def test_disabled_gate_lets_everything_through() -> None:
    assert await _get(AuthSettings(), PATH) == 200


async def test_requires_a_token() -> None:
    assert await _get(_settings(), PATH) == 401


async def test_health_stays_public() -> None:
    assert await _get(_settings(), "/api/v1/health") == 200


async def test_valid_token_from_allowed_domain_passes() -> None:
    assert await _get(_settings(), PATH, authorization=f"Bearer {_token()}") == 200


@pytest.mark.parametrize(
    "claims",
    [
        {"email": "someone@gmail.com"},
        {"aud": "anon"},
        {"iss": "https://other.supabase.co/auth/v1"},
        {"exp": int(time.time()) - 10},
    ],
    ids=["other-domain", "wrong-audience", "wrong-issuer", "expired"],
)
async def test_rejects_bad_claims(claims: dict[str, Any]) -> None:
    token = _token(**claims)
    assert await _get(_settings(), PATH, authorization=f"Bearer {token}") == 401


async def test_rejects_a_forged_signature() -> None:
    token = _token(key="x" * 40)
    assert await _get(_settings(), PATH, authorization=f"Bearer {token}") == 401


async def test_explicit_email_allowlist() -> None:
    auth = _settings(
        allowed_domains=frozenset(), allowed_emails=frozenset({"ops@partner.com"})
    )
    ok = _token(email="ops@partner.com")
    no = _token(email="other@partner.com")
    assert await _get(auth, PATH, authorization=f"Bearer {ok}") == 200
    assert await _get(auth, PATH, authorization=f"Bearer {no}") == 401


async def test_asymmetric_tokens_verify_against_jwks() -> None:
    private = ec.generate_private_key(ec.SECP256R1())
    auth = _settings(jwt_secret="")
    fake_jwks = MagicMock()
    fake_jwks.get_signing_key_from_jwt.return_value = MagicMock(
        key=private.public_key()
    )
    object.__setattr__(auth, "jwks_client", fake_jwks)  # cached_property slot
    token = _token(key=private, alg="ES256")
    assert await _get(auth, PATH, authorization=f"Bearer {token}") == 200
    other = _token(key=ec.generate_private_key(ec.SECP256R1()), alg="ES256")
    assert await _get(auth, PATH, authorization=f"Bearer {other}") == 401


async def test_render_secret_lets_the_pdf_renderer_through() -> None:
    assert await _get(_settings(), PATH, **{RENDER_HEADER: RENDER}) == 200
    assert await _get(_settings(), PATH, **{RENDER_HEADER: "wrong"}) == 401


def test_half_configured_auth_refuses_to_start() -> None:
    with pytest.raises(RuntimeError):
        _settings(supabase_url="").validate()
    with pytest.raises(RuntimeError):
        _settings(render_secret="short").validate()
    with pytest.raises(RuntimeError):
        AuthSettings(provider="okta").validate()
    _settings().validate()
    AuthSettings().validate()
