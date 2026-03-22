import base64
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from agents.main import supabase
from api.routes.auth_utils import extract_bearer_token


router = APIRouter(prefix="/agents", tags=["agents"])


class GmailSendRequest(BaseModel):
    to_email: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body text")
    outreach_email_id: int | None = Field(default=None, description="Optional outreach email record ID")


class GmailDraftRequest(BaseModel):
    to_email: str | None = Field(default=None, description="Optional recipient email address")
    subject: str = Field(..., description="Email subject")
    body: str = Field(..., description="Email body text")
    outreach_email_id: int | None = Field(default=None, description="Optional outreach email record ID")


def _build_gmail_raw_message(to_email: str | None, subject: str, body: str) -> str:
    lines = []
    safe_to = (to_email or "").strip()
    if safe_to:
        lines.append(f"To: {safe_to}")
    lines.append(f"Subject: {subject}")
    lines.append("Content-Type: text/plain; charset=UTF-8")
    lines.append("")
    lines.append(body)

    message = "\r\n".join(lines)

    return base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8")


@router.post("/send-gmail")
async def send_gmail_route(
    payload: GmailSendRequest,
    access_token: str | None = Depends(extract_bearer_token),
):
    token = (access_token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Google access token. Please log in first.")

    to_email = payload.to_email.strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")

    raw_message = _build_gmail_raw_message(to_email, payload.subject or "", payload.body or "")

    async with httpx.AsyncClient(timeout=20.0) as client:
        gmail_res = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw_message},
        )

    if gmail_res.status_code == 401:
        raise HTTPException(status_code=401, detail="Google token expired or unauthorized. Please log in again.")

    if gmail_res.status_code < 200 or gmail_res.status_code >= 300:
        detail = "Gmail send failed"
        try:
            data = gmail_res.json()
            detail = data.get("error", {}).get("message") or str(data)
        except Exception:
            detail = gmail_res.text or detail
        raise HTTPException(status_code=400, detail=detail)

    result = gmail_res.json()

    sent_at = datetime.now(timezone.utc).isoformat()
    if payload.outreach_email_id is not None:
        try:
            supabase.table("business_outreach_emails").update({"sent_at": sent_at}).eq("id", payload.outreach_email_id).execute()
        except Exception:
            # The table may not include sent_at yet; don't fail Gmail send for this.
            pass

    return {
        "ok": True,
        "id": result.get("id"),
        "thread_id": result.get("threadId"),
        "sent_at": sent_at,
    }


@router.post("/save-gmail-draft")
async def save_gmail_draft_route(
    payload: GmailDraftRequest,
    access_token: str | None = Depends(extract_bearer_token),
):
    token = (access_token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Google access token. Please log in first.")

    raw_message = _build_gmail_raw_message(payload.to_email, payload.subject or "", payload.body or "")

    async with httpx.AsyncClient(timeout=20.0) as client:
        gmail_res = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"message": {"raw": raw_message}},
        )

    if gmail_res.status_code == 401:
        raise HTTPException(status_code=401, detail="Google token expired or unauthorized. Please log in again.")

    if gmail_res.status_code < 200 or gmail_res.status_code >= 300:
        detail = "Gmail draft save failed"
        try:
            data = gmail_res.json()
            detail = data.get("error", {}).get("message") or str(data)
        except Exception:
            detail = gmail_res.text or detail
        raise HTTPException(status_code=400, detail=detail)

    result = gmail_res.json()
    return {
        "ok": True,
        "draft_id": result.get("id"),
        "message_id": (result.get("message") or {}).get("id"),
    }
