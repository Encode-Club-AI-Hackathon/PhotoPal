from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agents.main import run_business_matcher
from api.routes.auth_utils import extract_bearer_token


router = APIRouter(prefix="/agents", tags=["agents"])


class BusinessMatcherRequest(BaseModel):
    photographer_id: str = Field(..., description="Photographer identifier (wallet UID)")
    city: str | None = Field(default=None, description="Fallback city for lead finder when no local businesses exist")
    radius_km: float = Field(default=20.0, ge=1.0, le=100.0, description="Local search radius in kilometers")
    limit: int = Field(default=5, ge=1, le=20, description="Maximum number of matched businesses to return")
    use_cache: bool = Field(default=True, description="Return saved connection rows when available")
    excluded_business_ids: list[int] = Field(default_factory=list, description="Business IDs to exclude from returned opportunities")


@router.post("/business-matcher")
async def business_matcher_route(
    payload: BusinessMatcherRequest,
    civic_access_token: str | None = Depends(extract_bearer_token),
):
    try:
        result = await run_business_matcher(
            photographer_id=payload.photographer_id,
            city=payload.city,
            radius_km=payload.radius_km,
            limit=payload.limit,
            use_cache=payload.use_cache,
            excluded_business_ids=payload.excluded_business_ids,
            civic_access_token=civic_access_token,
        )
        return JSONResponse(content=jsonable_encoder(result))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
