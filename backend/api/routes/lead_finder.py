from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.main import run_lead_finder


router = APIRouter(prefix="/agents", tags=["agents"])


class LeadFinderRequest(BaseModel):
    photographer_id: int = Field(..., description="photographer_profiles.photographer_id")


@router.post("/lead-finder")
async def lead_finder_route(payload: LeadFinderRequest):
    try:
        result = await run_lead_finder(payload.photographer_id)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
