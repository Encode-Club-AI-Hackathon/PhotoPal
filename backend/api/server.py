from fastapi import FastAPI

from api.routes.business_outreach import router as business_outreach_router
from api.routes.lead_finder import router as lead_finder_router
from api.routes.portfolio_analyser import router as portfolio_analyser_router


app = FastAPI(title="PhotoPal Agent API")

app.include_router(lead_finder_router)
app.include_router(portfolio_analyser_router)
app.include_router(business_outreach_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}