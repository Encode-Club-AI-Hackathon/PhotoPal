import os
import time
import uuid
from threading import Lock
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from api.routes.business_outreach import router as business_outreach_router
from api.routes.lead_finder import router as lead_finder_router
from api.routes.portfolio_analyser import router as portfolio_analyser_router
from civic_auth import CivicAuth
from civic_auth.integrations.fastapi import FastAPICookieStorage, create_auth_dependencies

from agents.main import set_single_row

# Get CLIENT_ID and CLIENT_SECRET from environment variables or configuration
CLIENT_ID = os.getenv("CIVIC_CLIENT_ID")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
CIVIC_REDIRECT_URL = os.getenv("CIVIC_REDIRECT_URL")
CIVIC_POST_LOGOUT_REDIRECT_URL = os.getenv("CIVIC_POST_LOGOUT_REDIRECT_URL")
DEVICE_SESSION_TTL_SEC = int(os.getenv("DEVICE_SESSION_TTL_SEC", "600"))
DEVICE_POLL_INTERVAL_SEC = int(os.getenv("DEVICE_POLL_INTERVAL_SEC", "3"))
DEVICE_SESSION_COOKIE = "device_session_id"
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_REDIRECT_URL = os.getenv(
    "GOOGLE_OAUTH_REDIRECT_URL",
    (f"{PUBLIC_BASE_URL}/auth/google/callback" if PUBLIC_BASE_URL else "http://localhost:8000/auth/google/callback"),
)
CIVIC_CLIENT_SECRET = os.getenv("CIVIC_CLIENT_SECRET", "")


def _parse_scopes(raw: str | None, default: list[str]) -> list[str]:
    if not raw:
        return default
    normalized = raw.replace(",", " ").split()
    return [scope.strip() for scope in normalized if scope.strip()]


GOOGLE_SCOPES = _parse_scopes(
    os.getenv("GOOGLE_SCOPES"),
    [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
    ],
)


DEFAULT_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.addons.current.action.compose",
    "https://www.googleapis.com/auth/gmail.addons.current.message.action",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.metadata",
    "https://www.googleapis.com/auth/gmail.insert",
    "https://www.googleapis.com/auth/gmail.addons.current.message.metadata",
    "https://www.googleapis.com/auth/gmail.addons.current.message.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/gmail.settings.sharing",
]
CIVIC_SCOPES = _parse_scopes(os.getenv("CIVIC_SCOPES"), DEFAULT_SCOPES)

app = FastAPI(title="PhotoPal Agent API")
config = {
    "client_id": CLIENT_ID,  # Get this from auth.civic.com
    "redirect_url": CIVIC_REDIRECT_URL
    or (f"{PUBLIC_BASE_URL}/auth/callback" if PUBLIC_BASE_URL else "http://localhost:8000/auth/callback"),
    "post_logout_redirect_url": CIVIC_POST_LOGOUT_REDIRECT_URL
    or (f"{PUBLIC_BASE_URL}/" if PUBLIC_BASE_URL else "http://localhost:8000/"),
    "scopes": CIVIC_SCOPES,
}
app.include_router(lead_finder_router)
app.include_router(portfolio_analyser_router)
app.include_router(business_outreach_router)
app.include_router(gmail_recent_subjects_router)

civic_auth_dep, get_current_user, require_auth = create_auth_dependencies(config)


@app.get("/auth/login")
async def auth_login(request: Request):
    redirect_response = RedirectResponse(url="/", status_code=302)
    storage = FastAPICookieStorage(request, redirect_response)
    civic_auth = CivicAuth(storage, config)
    url = await civic_auth.build_login_url(scopes=config.get("scopes"))
    redirect_response.headers["location"] = url
    return redirect_response


@app.get("/auth/callback")
async def auth_callback(code: str, state: str, request: Request):
    redirect_response = RedirectResponse(url="/", status_code=302)
    storage = FastAPICookieStorage(request, redirect_response)
    civic_auth = CivicAuth(storage, config)
    await civic_auth.resolve_oauth_access_code(code, state)
    return redirect_response


@app.get("/auth/logout")
async def auth_logout(request: Request):
    redirect_response = RedirectResponse(url="/", status_code=302)
    storage = FastAPICookieStorage(request, redirect_response)
    civic_auth = CivicAuth(storage, config)
    url = await civic_auth.build_logout_redirect_url()
    redirect_response.headers["location"] = url
    return redirect_response


@app.get("/auth/logoutcallback")
async def auth_logout_callback(state: Optional[str] = None):
    return RedirectResponse(url="/", status_code=302)

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


_google_oauth_states: Dict[str, Dict[str, Any]] = {}


def _cleanup_expired_google_states() -> None:
    now = _now()
    for state, payload in list(_google_oauth_states.items()):
        if now >= payload.get("expires_at", 0):
            _google_oauth_states.pop(state, None)


def _build_google_auth_url(state: str) -> str:
    params = {
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": GOOGLE_OAUTH_REDIRECT_URL,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def _base_url_from_request(request: Request) -> str:
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    return str(request.base_url).rstrip("/")


def _render_auth_page(
        title: str,
        subtitle: str,
        status_badge: str,
        primary_label: Optional[str] = None,
        primary_href: Optional[str] = None,
        code: Optional[str] = None,
) -> str:
        button_html = ""
        if primary_label and primary_href:
                button_html = (
                        f"<a class='btn btn-primary' href='{primary_href}'>{primary_label}</a>"
                )

        # code_html = ""
        # if code:
        #     code_html = (
        #         "<div class='code-wrap'>"
        #         "<p class='code-label'>One-time code</p>"
        #         f"<p class='code'>{code}</p>"
        #         "</div>"
        #     )
        code_html = ""

        return f"""
<!doctype html>
<html lang='en'>
<head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1' />
    <title>PhotoPal Login</title>
    <style>
        :root {{
            --bg-a: #f7efe5;
            --bg-b: #f1f6ff;
            --card: #ffffff;
            --text: #17212f;
            --muted: #516072;
            --line: #d9e1ec;
            --brand: #2067f5;
            --brand-hover: #1a56cc;
            --success: #0f9d58;
            --radius: 18px;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: var(--text);
            background:
                radial-gradient(1200px 700px at 10% 0%, #ffe4cc 0%, transparent 55%),
                radial-gradient(900px 600px at 100% 100%, #dbeafe 0%, transparent 50%),
                linear-gradient(145deg, var(--bg-a), var(--bg-b));
            display: grid;
            place-items: center;
            padding: 24px;
        }}
        .card {{
            width: min(560px, 100%);
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: var(--radius);
            box-shadow: 0 18px 48px rgba(17, 28, 45, 0.13);
            padding: 30px 26px;
        }}
        .logo {{
            margin: 0 0 10px;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--brand);
        }}
        .status {{
            display: inline-block;
            padding: 7px 11px;
            border-radius: 999px;
            background: #eef5ff;
            color: #1849a9;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 14px;
        }}
        h1 {{
            margin: 0 0 10px;
            font-size: clamp(25px, 4vw, 34px);
            line-height: 1.14;
            letter-spacing: -0.02em;
        }}
        p {{
            margin: 0;
            color: var(--muted);
            line-height: 1.55;
        }}
        .body {{
            margin-top: 8px;
        }}
        .actions {{
            margin-top: 22px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }}
        .btn {{
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
            padding: 12px 16px;
            font-weight: 600;
            border: 1px solid transparent;
            transition: background-color .16s ease, transform .16s ease;
        }}
        .btn-primary {{
            background: var(--brand);
            color: #fff;
        }}
        .btn-primary:hover {{
            background: var(--brand-hover);
            transform: translateY(-1px);
        }}
        .code-wrap {{
            margin-top: 18px;
            padding: 14px;
            background: #f9fbff;
            border: 1px dashed #c6d6ef;
            border-radius: 12px;
        }}
        .code-label {{
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            color: #38598a;
            margin-bottom: 6px;
        }}
        .code {{
            margin: 0;
            font-size: 25px;
            letter-spacing: 0.11em;
            color: var(--success);
            font-weight: 700;
        }}
    </style>
</head>
<body>
    <main class='card'>
        <p class='logo'>PhotoPal</p>
        <span class='status'>{status_badge}</span>
        <h1>{title}</h1>
        <p class='body'>{subtitle}</p>
        {code_html}
        <div class='actions'>{button_html}</div>
    </main>
</body>
</html>
"""


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
            "id_token": "",
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
                "id_token": session.get("id_token", ""),
                "profile": session.get("profile", {}),
                "provider": session.get("provider", ""),
            }
        )
    return resp


@app.get("/auth/google/login")
async def auth_google_login(request: Request, session_id: Optional[str] = None):
    if not GOOGLE_OAUTH_CLIENT_ID or not GOOGLE_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET")

    _cleanup_expired_sessions()
    _cleanup_expired_google_states()

    cookie_session_id = request.cookies.get(DEVICE_SESSION_COOKIE)
    active_session_id = session_id or cookie_session_id
    if not active_session_id:
        raise HTTPException(status_code=400, detail="Missing session_id for device login")

    with _device_lock:
        session = _device_sessions.get(active_session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    if session["status"] == "expired":
        raise HTTPException(status_code=400, detail="Session expired")

    state = uuid.uuid4().hex
    _google_oauth_states[state] = {
        "session_id": active_session_id,
        "expires_at": _now() + DEVICE_SESSION_TTL_SEC,
    }
    return RedirectResponse(url=_build_google_auth_url(state), status_code=302)


@app.get("/auth/google/callback")
async def auth_google_callback(code: str, state: str):
    _cleanup_expired_sessions()
    _cleanup_expired_google_states()

    state_payload = _google_oauth_states.pop(state, None)
    if not state_payload:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    session_id = state_payload["session_id"]
    with _device_lock:
        session = _device_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": GOOGLE_OAUTH_REDIRECT_URL,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_response.text}")

        token_json = token_response.json()
        access_token = token_json.get("access_token", "")
        refresh_token = token_json.get("refresh_token", "")
        id_token = token_json.get("id_token", "")

        profile: Dict[str, Any] = {}
        if access_token:
            profile_response = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if profile_response.status_code == 200:
                profile = profile_response.json()

    with _device_lock:
        session = _device_sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Unknown session_id")
        session["status"] = "approved"
        session["provider"] = "google"
        session["access_token"] = access_token
        session["refresh_token"] = refresh_token
        session["id_token"] = id_token
        session["profile"] = profile

    return HTMLResponse(
        _render_auth_page(
            title="Google login complete",
            subtitle="Return to the mini app. It will continue polling and complete sign in automatically.",
            status_badge="Success",
        )
    )


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
        return HTMLResponse(
            _render_auth_page(
                title="Session expired",
                subtitle="Return to the mini app and start login again.",
                status_badge="Expired",
            )
        )

    html = _render_auth_page(
        title="Sign in to PhotoPal",
        subtitle="This opens Google OAuth in a secure browser tab for Gmail access. Once complete, return to the mini app.",
        status_badge="Secure Browser",
        primary_label="Continue with Google",
        primary_href=f"/auth/google/login?session_id={session_id}",
        # code=session.get("user_code") or None,
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
                _render_auth_page(
                    title="Login complete",
                    subtitle="You can now return to the mini app. It will continue polling and finish sign in automatically.",
                    status_badge="Success",
                )
            )
            response.delete_cookie(key=DEVICE_SESSION_COOKIE, path="/")
            return response

        response = HTMLResponse(
            _render_auth_page(
                title="Session unavailable",
                subtitle="The login session was not found or has expired. Return to the mini app and try again.",
                status_badge="Needs Restart",
            )
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


class CivicTokenExchangeRequest(BaseModel):
    subject_token: str


@app.post("/auth/civic/exchange")
async def civic_token_exchange(payload: CivicTokenExchangeRequest):
    if not CLIENT_ID or not CIVIC_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Missing CIVIC_CLIENT_ID or CIVIC_CLIENT_SECRET")

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://auth.civic.com/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                "client_id": CLIENT_ID,
                "client_secret": CIVIC_CLIENT_SECRET,
                "subject_token": payload.subject_token,
                "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
                "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Civic token exchange failed: {response.text}")

    return response.json()


# Auth tokens sql schema:
# CREATE TABLE auth_tokens (
#     access_token TEXT NOT NULL,
# );