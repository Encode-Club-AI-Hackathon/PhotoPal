from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agents.main import run_lead_finder
from api.routes.auth_utils import extract_bearer_token


router = APIRouter(prefix="/agents", tags=["agents"])


class LeadFinderRequest(BaseModel):
    photographer_id: int = Field(..., description="photographer_profiles.photographer_id")


@router.post("/lead-finder")
async def lead_finder_route(payload: LeadFinderRequest, civic_access_token: str | None = Depends(extract_bearer_token)):
    try:
        result = await run_lead_finder(payload.photographer_id, civic_access_token=civic_access_token)
        return JSONResponse(content=jsonable_encoder(result))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
