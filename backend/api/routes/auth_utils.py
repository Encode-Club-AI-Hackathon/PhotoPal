import base64
import json

from fastapi import Header


def extract_bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    return token.strip() or None


def _safe_b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _is_likely_civic_jwt(token: str) -> bool:
    parts = token.split(".")
    if len(parts) != 3:
        return False

    try:
        payload_bytes = _safe_b64url_decode(parts[1])
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
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


def extract_civic_bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    token = extract_bearer_token(authorization)
    if not token:
        return None

    if _is_likely_civic_jwt(token):
        return token

    return None