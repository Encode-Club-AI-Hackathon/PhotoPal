from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from agents.gmail_recent_subjects import fetch_recent_email_subjects
from api.routes.auth_utils import extract_bearer_token


router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/gmail-recent-subjects")
async def gmail_recent_subjects_route(access_token: str | None = Depends(extract_bearer_token)):
	try:
		if not access_token:
			raise HTTPException(status_code=401, detail="Missing bearer token")

		result = await fetch_recent_email_subjects(access_token)
		return JSONResponse(content=jsonable_encoder(result))
	except ValueError as exc:
		raise HTTPException(status_code=400, detail=str(exc)) from exc
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc