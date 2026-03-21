from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from agents.main import run_gmail_recent_subjects
from api.routes.auth_utils import extract_bearer_token


router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/gmail-recent-subjects")
async def gmail_recent_subjects_route(civic_access_token: str | None = Depends(extract_bearer_token)):
	try:
		result = await run_gmail_recent_subjects(civic_access_token=civic_access_token)
		return JSONResponse(content=jsonable_encoder(result))
	except ValueError as exc:
		raise HTTPException(status_code=400, detail=str(exc)) from exc
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc