from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agents.main import run_business_outreach


router = APIRouter(prefix="/agents", tags=["agents"])


class BusinessOutreachRequest(BaseModel):
    business_id: int = Field(..., description="businesses.id")
    photographer_id: int = Field(..., description="photographer_profiles.photographer_id")


@router.post("/business-outreach")
async def business_outreach_route(payload: BusinessOutreachRequest):
    try:
        result = await run_business_outreach(payload.business_id, payload.photographer_id)
        return JSONResponse(content=jsonable_encoder(result))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
