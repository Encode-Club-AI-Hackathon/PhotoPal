import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agents.main import run_portfolio_analyser
from api.routes.auth_utils import extract_bearer_token

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/agents", tags=["agents"])


class PortfolioAnalyserRequest(BaseModel):
    website_url: str = Field(..., description="Portfolio website URL")
    instagram_handle: str | None = Field(default=None, description="Instagram handle without @")
    photographer_id: str | None = Field(default=None, description="Photographer ID (wallet UID)")


@router.post("/portfolio-analyser")
async def portfolio_analyser_route(payload: PortfolioAnalyserRequest, civic_access_token: str | None = Depends(extract_bearer_token)):
    try:
        print(f"\n{'='*60}")
        print(f"portfolio_analyser_route called")
        print(f"  website_url: {payload.website_url}")
        print(f"  instagram_handle: {payload.instagram_handle}")
        print(f"  photographer_id: {payload.photographer_id}")
        print(f"  civic_access_token_present: {'yes' if civic_access_token else 'no'}")
        print(f"{'='*60}\n")
        
        result = await run_portfolio_analyser(
            payload.website_url,
            payload.instagram_handle,
            payload.photographer_id,
            civic_access_token=civic_access_token,
        )
        
        print(f"\n{'='*60}")
        print(f"run_portfolio_analyser completed successfully")
        print(f"Result keys: {result.keys() if isinstance(result, dict) else 'not a dict'}")
        print(f"{'='*60}\n")
        
        return JSONResponse(content=jsonable_encoder(result))
    except ValueError as exc:
        error_msg = f"ValueError: {str(exc)}"
        print(f"\nERROR (ValueError): {error_msg}")
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=400, detail=error_msg) from exc
    except Exception as exc:
        error_msg = f"Exception: {type(exc).__name__}: {str(exc)}"
        print(f"\nERROR (Exception): {error_msg}")
        import traceback
        traceback.print_exc()
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg) from exc
