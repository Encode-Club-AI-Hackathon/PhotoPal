import base64
import json
import os
from typing import Any, Optional

import httpx


CIVIC_CLIENT_ID = os.getenv("CIVIC_CLIENT_ID", "")
CIVIC_CLIENT_SECRET = os.getenv("CIVIC_CLIENT_SECRET", "")
CIVIC_TOKEN = os.getenv("CIVIC_TOKEN", "")
CIVIC_TOKEN_URL = os.getenv("CIVIC_TOKEN_URL", "https://auth.civic.com/oauth/token")


def _safe_b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _decode_jwt_payload(token: str) -> Optional[dict[str, Any]]:
    parts = token.split(".")
    if len(parts) != 3:
        return None

    try:
        payload_bytes = _safe_b64url_decode(parts[1])
        return json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return None


def is_likely_civic_token(token: str) -> bool:
    payload = _decode_jwt_payload(token)
    if not payload:
        return False

    iss = str(payload.get("iss") or "")
    aud = payload.get("aud")

    if "auth.civic.com" in iss:
        return True
    if aud == "civic":
        return True
    if isinstance(aud, list) and "civic" in aud:
        return True
    return False


async def exchange_subject_token_for_civic_token(subject_token: str) -> str:
    if not CIVIC_CLIENT_ID or not CIVIC_CLIENT_SECRET:
        raise ValueError("Missing CIVIC_CLIENT_ID or CIVIC_CLIENT_SECRET for token exchange")

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            CIVIC_TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                "client_id": CIVIC_CLIENT_ID,
                "client_secret": CIVIC_CLIENT_SECRET,
                "subject_token": subject_token,
                "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
                "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        raise ValueError(f"Civic token exchange failed: {response.text}")

    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise ValueError("Civic token exchange response missing access_token")

    return access_token


async def resolve_civic_access_token(subject_token: str | None) -> str:
    # 1) Caller already passed a Civic token.
    if subject_token and is_likely_civic_token(subject_token):
        return subject_token

    # 2) Caller passed a non-Civic token (Google/Auth.js/etc): exchange it.
    if subject_token:
        try:
            return await exchange_subject_token_for_civic_token(subject_token)
        except Exception:
            # Fall through to static token fallback for resiliency in hackathon mode.
            pass

    # 3) Fallback to static Civic token from environment.
    if CIVIC_TOKEN:
        return CIVIC_TOKEN

    raise ValueError("No usable Civic token found. Provide subject token or set CIVIC_TOKEN")
