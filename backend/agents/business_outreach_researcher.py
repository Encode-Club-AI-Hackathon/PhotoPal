import os
import logging
from typing import Any, List, Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState, StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from .civic_token_exchange import resolve_civic_access_token


civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")

logging.getLogger("langchain_google_genai").setLevel(logging.ERROR)


class OutreachDraft(BaseModel):
    business_id: int = Field(description="Foreign key ID to businesses table")
    photographer_profile_id: str = Field(description="Foreign key ID to photographer_profiles table")
    research_summary: str = Field(description="Short summary of findings about the business and online presence")
    social_insights: List[str] = Field(default_factory=list, description="Specific insights from socials or public content")
    pain_points: List[str] = Field(default_factory=list, description="Likely marketing/content pain points")
    photo_opportunities: List[str] = Field(default_factory=list, description="Photo/video opportunities relevant to this business")
    fit_score: float = Field(description="How strong this business is as a fit for the photographer, from 0 to 100")
    fit_rationale: str = Field(description="Why this business is or is not a good fit for the photographer profile")
    email_subject: str = Field(description="Tailored cold outreach subject line")
    email_body: str = Field(description="Tailored cold outreach email body")
    call_to_action: str = Field(description="Single clear call to action from the email")
    confidence_score: Optional[float] = Field(default=None, description="0-1 confidence in research quality")


class OutreachDraftList(BaseModel):
    outreach_drafts: List[OutreachDraft] = Field(description="List of researched and tailored outreach drafts")


SUBMIT_TOOL_NAME = "submit_final_outreach_drafts"
RESULTS_KEY = "outreach_drafts"
TARGET_TABLE = "business_outreach_emails"


def build_prompt(business: dict[str, Any], photographer_profile: dict[str, Any]) -> str:
    business_id = business.get("id")
    business_name = business.get("business_name", "Unknown Business")
    business_type = business.get("type", "Unknown")
    website = business.get("website")
    notes = business.get("notes_needs")

    photographer_profile_id = photographer_profile.get("photographer_id")
    photographer_name = photographer_profile.get("name", "Unknown Photographer")
    primary_niche = photographer_profile.get("primary_niche", "general photography")
    secondary_niches = photographer_profile.get("secondary_niches") or []
    location_city = photographer_profile.get("location_city")
    location_country = photographer_profile.get("location_country")
    travel = photographer_profile.get("willingness_to_travel")
    photographer_website = photographer_profile.get("website_url")
    photographer_instagram = photographer_profile.get("instagram_handle")
    photographer_email = photographer_profile.get("contact_email")

    return (
        "Research this specific business deeply (website + socials + public presence), then write a tailored cold outreach email for the photographer below. "
        "Also rank fit quality for this photographer and explain why. "
        f"Business context: id={business_id}, name='{business_name}', type='{business_type}', website='{website}', notes_needs='{notes}'. "
        f"Photographer context: photographer_profile_id={photographer_profile_id}, name='{photographer_name}', primary_niche='{primary_niche}', "
        f"secondary_niches={secondary_niches}, location_city='{location_city}', location_country='{location_country}', willingness_to_travel={travel}, "
        f"website_url='{photographer_website}', instagram_handle='{photographer_instagram}', contact_email='{photographer_email}'. "
        "Output exactly one outreach draft row and keep `business_id` and `photographer_profile_id` unchanged from the provided context. "
        "Set `fit_score` between 0 and 100. "
        "If including portfolio or contact links/details, use the real photographer profile values above; never output placeholders like '[Link to Portfolio]' or '[Your Email]'. "
        "Once complete, you MUST call submit_final_outreach_drafts with your final structured result."
    )


@tool(args_schema=OutreachDraftList)
def submit_final_outreach_drafts(outreach_drafts: List[OutreachDraft]):
    """Use this tool ONLY when outreach research and email drafting are complete."""
    return outreach_drafts


async def create_agent(civic_access_token: str | None = None):
    active_token = await resolve_civic_access_token(civic_access_token)

    if not civic_url or not active_token:
        raise ValueError("Missing CIVIC_URL or CIVIC_TOKEN in environment.")

    client = MultiServerMCPClient(
        {
            "civic-nexus": {
                "transport": "streamable_http",
                "url": civic_url,
                "headers": {"Authorization": f"Bearer {active_token}"},
            }
        }
    )

    mcp_tools = await client.get_tools()
    all_tools = mcp_tools + [submit_final_outreach_drafts]

    model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.25)
    model_with_tools = model.bind_tools(all_tools)

    def call_model(state: MessagesState):
        response = model_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    def route_after_agent(state: MessagesState):
        last_message = state["messages"][-1]

        if not getattr(last_message, "tool_calls", None):
            return END

        for tool_call in last_message.tool_calls:
            if tool_call["name"] == SUBMIT_TOOL_NAME:
                return END

        return "tools"

    workflow = StateGraph(MessagesState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", ToolNode(mcp_tools))

    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", route_after_agent)
    workflow.add_edge("tools", "agent")

    return workflow.compile(checkpointer=MemorySaver())
