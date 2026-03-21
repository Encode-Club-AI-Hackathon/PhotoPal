from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.main import run_portfolio_analyser


router = APIRouter(prefix="/agents", tags=["agents"])


class PortfolioAnalyserRequest(BaseModel):
    website_url: str = Field(..., description="Portfolio website URL")
    instagram_handle: str | None = Field(default=None, description="Instagram handle without @")


@router.post("/portfolio-analyser")
async def portfolio_analyser_route(payload: PortfolioAnalyserRequest):
    try:
        result = await run_portfolio_analyser(payload.website_url, payload.instagram_handle)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
