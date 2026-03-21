import os
import logging
from typing import List, Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState, StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool
from pydantic import BaseModel, Field


civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")

logging.getLogger("langchain_google_genai").setLevel(logging.ERROR)


class PhotographerProfile(BaseModel):
	name: str = Field(description="Photographer name")
	primary_niche: str = Field(description="Primary photography niche")
	contact_email: Optional[str] = Field(default=None, description="Public contact email")
	website_url: Optional[str] = Field(default=None, description="Website URL")
	instagram_handle: Optional[str] = Field(default=None, description="Instagram handle without @")
	secondary_niches: List[str] = Field(default_factory=list, description="Secondary niches")
	human_presence: Optional[bool] = Field(default=None, description="Whether a human appears in portfolio content")
	location_city: Optional[str] = Field(default=None, description="Primary city")
	location_country: Optional[str] = Field(default=None, description="Primary country")
	willingness_to_travel: Optional[bool] = Field(default=None, description="Whether they state willingness to travel")
	studio_access: Optional[bool] = Field(default=None, description="Whether they mention studio access")


class ProfileList(BaseModel):
	profiles: List[PhotographerProfile] = Field(description="Structured photographer profiles")


SUBMIT_TOOL_NAME = "submit_final_profiles"
RESULTS_KEY = "profiles"
TARGET_TABLE = "photographer_profiles"


def build_prompt(website_url: str, instagram_handle: str | None = None) -> str:
	insta_part = f" Instagram: @{instagram_handle}." if instagram_handle else ""
	return (
		f"Analyze this photographer profile. Website: {website_url}.{insta_part} "
		"Use the portfolio-analyzer skill to extract structured profile data from portfolio and socials. "
		"Once complete, you MUST call `submit_final_profiles` with your final results."
	)


@tool(args_schema=ProfileList)
def submit_final_profiles(profiles: List[PhotographerProfile]):
	"""Use this tool ONLY when portfolio analysis is complete and you are ready to submit structured profiles."""
	return profiles


async def create_agent():
	if not civic_url or not civic_token:
		raise ValueError("Missing CIVIC_URL or CIVIC_TOKEN in environment.")

	client = MultiServerMCPClient(
		{
			"civic-nexus": {
				"transport": "streamable_http",
				"url": civic_url,
				"headers": {"Authorization": f"Bearer {civic_token}"},
			}
		}
	)

	mcp_tools = await client.get_tools()
	all_tools = mcp_tools + [submit_final_profiles]

	model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.2)
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
