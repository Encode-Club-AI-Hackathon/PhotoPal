import os
import time
import uuid
from threading import Lock
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from api.routes.business_outreach import router as business_outreach_router
from api.routes.lead_finder import router as lead_finder_router
from api.routes.portfolio_analyser import router as portfolio_analyser_router
from civic_auth.integrations.fastapi import Depends, create_auth_router, create_auth_dependencies

from agents.main import set_single_row

# Get CLIENT_ID and CLIENT_SECRET from environment variables or configuration
CLIENT_ID = os.getenv("CIVIC_CLIENT_ID")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
CIVIC_REDIRECT_URL = os.getenv("CIVIC_REDIRECT_URL")
CIVIC_POST_LOGOUT_REDIRECT_URL = os.getenv("CIVIC_POST_LOGOUT_REDIRECT_URL")
DEVICE_SESSION_TTL_SEC = int(os.getenv("DEVICE_SESSION_TTL_SEC", "600"))
DEVICE_POLL_INTERVAL_SEC = int(os.getenv("DEVICE_POLL_INTERVAL_SEC", "3"))
DEVICE_SESSION_COOKIE = "device_session_id"

app = FastAPI(title="PhotoPal Agent API")
config = {
    "client_id": CLIENT_ID,  # Get this from auth.civic.com
    "redirect_url": CIVIC_REDIRECT_URL
    or (f"{PUBLIC_BASE_URL}/auth/callback" if PUBLIC_BASE_URL else "http://localhost:8000/auth/callback"),
    "post_logout_redirect_url": CIVIC_POST_LOGOUT_REDIRECT_URL
    or (f"{PUBLIC_BASE_URL}/" if PUBLIC_BASE_URL else "http://localhost:8000/"),
}
app.include_router(create_auth_router(config))
app.include_router(lead_finder_router)
app.include_router(portfolio_analyser_router)
app.include_router(business_outreach_router)

civic_auth_dep, get_current_user, require_auth = create_auth_dependencies(config)

# In-memory device sessions (good for hackathon/dev; move to Redis/DB for production)
_device_sessions: Dict[str, Dict[str, Any]] = {}
_device_lock = Lock()


class DeviceStartRequest(BaseModel):
    wallet_uid: Optional[str] = ""
    wallet_address: Optional[str] = ""


def _now() -> int:
    return int(time.time())


def _make_user_code() -> str:
    return uuid.uuid4().hex[:8].upper()


def _cleanup_expired_sessions() -> None:
    now = _now()
    with _device_lock:
        for sid, s in list(_device_sessions.items()):
            if s["status"] == "pending" and now >= s["expires_at"]:
                s["status"] = "expired"


def _base_url_from_request(request: Request) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    return str(request.base_url).rstrip("/")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/auth/device/start")
async def auth_device_start(payload: DeviceStartRequest, request: Request):
    _cleanup_expired_sessions()

    session_id = uuid.uuid4().hex
    user_code = _make_user_code()
    expires_at = _now() + DEVICE_SESSION_TTL_SEC

    base = _base_url_from_request(request)
    verification_url = f"{base}/auth/device/verify?session_id={session_id}"

    with _device_lock:
        _device_sessions[session_id] = {
            "status": "pending",
            "created_at": _now(),
            "expires_at": expires_at,
            "wallet_uid": payload.wallet_uid or "",
            "wallet_address": payload.wallet_address or "",
            "user_code": user_code,
            "access_token": "",
            "refresh_token": "",
            "profile": {},
        }

    return {
        "session_id": session_id,
        "verification_url": verification_url,
        "user_code": user_code,
        "expires_in": DEVICE_SESSION_TTL_SEC,
        "interval": DEVICE_POLL_INTERVAL_SEC,
    }


@app.get("/auth/device/status")
async def auth_device_status(session_id: str):
    _cleanup_expired_sessions()

    with _device_lock:
        session = _device_sessions.get(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    resp = {"status": session["status"]}
    if session["status"] == "approved":
        resp.update(
            {
                "access_token": session.get("access_token", ""),
                "refresh_token": session.get("refresh_token", ""),
                "profile": session.get("profile", {}),
            }
        )
    return resp


@app.get(
    "/auth/device/verify",
    response_class=HTMLResponse,
)
async def auth_device_verify(session_id: str):
    _cleanup_expired_sessions()

    with _device_lock:
        session = _device_sessions.get(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    if session["status"] == "expired":
        return HTMLResponse("<h3>Session expired. Return to the app and try again.</h3>")

    html = (
        "<h3>Continue with Google</h3>"
        "<p>Tap the button below to sign in securely in this browser.</p>"
        "<p><a href='/auth/login'>Login with Google</a></p>"
        "<p>After login, you will be returned here and can go back to the mini app.</p>"
    )
    response = HTMLResponse(html)
    response.set_cookie(
        key=DEVICE_SESSION_COOKIE,
        value=session_id,
        max_age=DEVICE_SESSION_TTL_SEC,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return response


@app.get("/", dependencies=[Depends(require_auth)])
async def tokens(request: Request, civic=Depends(civic_auth_dep)):
    tokens = await civic.get_tokens()
    device_session_id = request.cookies.get(DEVICE_SESSION_COOKIE)

    if device_session_id:
        _cleanup_expired_sessions()

        with _device_lock:
            session = _device_sessions.get(device_session_id)

        if session and session["status"] == "pending":
            user = await civic.get_user()
            profile: Dict[str, Any] = {}
            if user is not None:
                if hasattr(user, "model_dump"):
                    profile = user.model_dump()
                elif hasattr(user, "dict"):
                    profile = user.dict()

            with _device_lock:
                session["status"] = "approved"
                session["access_token"] = tokens.get("access_token", "")
                session["refresh_token"] = tokens.get("refresh_token", "")
                session["profile"] = profile

            response = HTMLResponse(
                "<h3>Login successful.</h3><p>You can now return to the mini app.</p>"
            )
            response.delete_cookie(key=DEVICE_SESSION_COOKIE, path="/")
            return response

        response = HTMLResponse(
            "<h3>Login session not found or expired.</h3><p>Return to the mini app and try again.</p>"
        )
        response.delete_cookie(key=DEVICE_SESSION_COOKIE, path="/")
        return response

    print(tokens["access_token"])
    print("Request details:")
    print(f"Headers: {request.headers}")
    print(f"Query params: {request.query_params}")
    print(f"Path params: {request.path_params}")
    print(f"Body: {await request.body()}")
    # set_single_row("auth_tokens", "id", "civic", {"access_token": tokens["access_token"]})
    return tokens


# Auth tokens sql schema:
# CREATE TABLE auth_tokens (
#     access_token TEXT NOT NULL,
# );