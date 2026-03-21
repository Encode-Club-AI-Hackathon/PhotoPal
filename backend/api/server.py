import os
from fastapi import FastAPI, Request

from api.routes.business_outreach import router as business_outreach_router
from api.routes.lead_finder import router as lead_finder_router
from api.routes.portfolio_analyser import router as portfolio_analyser_router
from civic_auth.integrations.fastapi import Depends, create_auth_router, create_auth_dependencies

from agents.main import set_single_row

# Get CLIENT_ID and CLIENT_SECRET from environment variables or configuration
CLIENT_ID = os.getenv("CIVIC_CLIENT_ID")

app = FastAPI(title="PhotoPal Agent API")
config = {
    "client_id": CLIENT_ID,  # Get this from auth.civic.com
    "redirect_url": "http://localhost:8000/auth/callback",
    "post_logout_redirect_url": "http://localhost:8000/",
}
app.include_router(create_auth_router(config))
app.include_router(lead_finder_router)
app.include_router(portfolio_analyser_router)
app.include_router(business_outreach_router)

civic_auth_dep, get_current_user, require_auth = create_auth_dependencies(config)

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/", dependencies=[Depends(require_auth)])
async def tokens(civic = Depends(civic_auth_dep)):
    tokens = await civic.get_tokens()
    print(tokens["access_token"])
    # set_single_row("auth_tokens", "id", "civic", {"access_token": tokens["access_token"]})
    return tokens


# Auth tokens sql schema:
# CREATE TABLE auth_tokens (
#     access_token TEXT NOT NULL,
# );