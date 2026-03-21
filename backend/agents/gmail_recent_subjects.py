from typing import Any

import httpx


async def fetch_recent_email_subjects(access_token: str, limit: int = 5) -> dict[str, Any]:
    if not access_token:
        raise ValueError("Missing Google access token")

    async with httpx.AsyncClient(timeout=15.0) as client:
        list_resp = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"maxResults": limit},
        )
        if list_resp.status_code != 200:
            raise ValueError(f"Google Gmail list failed: {list_resp.text}")

        messages = list_resp.json().get("messages", [])
        email_subjects: list[dict[str, str]] = []

        for msg in messages[:limit]:
            msg_id = msg.get("id")
            if not msg_id:
                continue

            msg_resp = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "metadata", "metadataHeaders": "Subject"},
            )
            if msg_resp.status_code != 200:
                continue

            headers = msg_resp.json().get("payload", {}).get("headers", [])
            subject = ""
            for h in headers:
                if (h.get("name") or "").lower() == "subject":
                    subject = h.get("value") or ""
                    break

            email_subjects.append({"subject": subject})

    return {
        "ok": True,
        "inserted_count": len(email_subjects),
        "data": {"email_subjects": email_subjects},
        "provider": "google",
    }