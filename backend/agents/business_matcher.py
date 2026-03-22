import logging
import os
from typing import Any, List

from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field

from .civic_token_exchange import resolve_civic_access_token


civic_url = os.getenv("CIVIC_URL")

logging.getLogger("langchain_google_genai").setLevel(logging.ERROR)


class BusinessMatch(BaseModel):
    business_id: int = Field(description="ID from the businesses table")
    fit_score: float = Field(description="Photographer-business fit score from 0 to 100")
    explanation_notes: str = Field(description="Why this business is a good or weak fit")


class BusinessMatchList(BaseModel):
    matches: List[BusinessMatch] = Field(description="Ranked business matches for the photographer")


SUBMIT_TOOL_NAME = "submit_business_matches"
RESULTS_KEY = "matches"


def _format_business_candidates(candidates: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for item in candidates:
        notes = item.get("notes_needs")
        notes_safe = notes if notes is not None else ""
        lines.append(
            f"- id={item.get('id')}, type='{item.get('type', '')}', notes_needs='{notes_safe}'"
        )
    return "\n".join(lines)


def build_prompt(
    photographer_profile: dict[str, Any],
    candidate_businesses: list[dict[str, Any]],
    limit: int,
) -> str:
    primary_niche = photographer_profile.get("primary_niche") or "general"
    secondary_niches = photographer_profile.get("secondary_niches") or []

    candidates_blob = _format_business_candidates(candidate_businesses)

    return (
        "You are matching businesses to a photographer for outreach prioritization. "
        "Use the photographer's primary niche and secondary niches against each business type and notes_needs. "
        "You are ONLY allowed to select business_id values from the provided candidates list. "
        f"Photographer primary_niche='{primary_niche}'. "
        f"Photographer secondary_niches={secondary_niches}. "
        f"Choose at most {limit} businesses and rank best-fit first. "
        "Set fit_score between 0 and 100. "
        "Provide concise explanation_notes per business. "
        "Candidate businesses:\n"
        f"{candidates_blob}\n"
        "Once complete, you MUST call submit_business_matches with your final structured result."
    )


@tool(args_schema=BusinessMatchList)
def submit_business_matches(matches: List[BusinessMatch]):
    """Use this tool ONLY when business matching is complete and final."""
    return matches


async def create_agent(civic_access_token: str | None = None):
    active_token = await resolve_civic_access_token(civic_access_token)

    if not civic_url or not active_token:
        raise ValueError("Missing CIVIC_URL or CIVIC token for business matcher.")

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
    all_tools = mcp_tools + [submit_business_matches]

    model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.15)
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
