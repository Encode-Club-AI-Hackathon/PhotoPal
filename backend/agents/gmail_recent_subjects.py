import logging
import os
from typing import List

from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field


civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")

logging.getLogger("langchain_google_genai").setLevel(logging.ERROR)


class EmailSubject(BaseModel):
	subject: str = Field(description="Subject line from an email")


class EmailSubjectList(BaseModel):
	email_subjects: List[EmailSubject] = Field(description="Exactly 5 most recent email subject lines")


SUBMIT_TOOL_NAME = "submit_recent_email_subjects"
RESULTS_KEY = "email_subjects"


def build_prompt() -> str:
	return (
		"Use ONLY Gmail tools to find the 5 most recent emails in the authenticated inbox. "
		"Return exactly 5 rows with only subject text in most-recent-first order. "
		"Do not include snippets, sender names, IDs, or body content. "
		"When done, you MUST call `submit_recent_email_subjects` with the final structured result."
	)


@tool(args_schema=EmailSubjectList)
def submit_recent_email_subjects(email_subjects: List[EmailSubject]):
	"""Use this tool only when you are ready to submit the last 5 email subjects."""
	return email_subjects


async def create_agent(civic_access_token: str | None = None):
  active_token = civic_access_token or civic_token
  print(f"Last 10 chars of active civic token: {active_token[-10:]}")
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
  gmail_tools = [tool_ for tool_ in mcp_tools if "gmail" in getattr(tool_, "name", "").lower()]
  if not gmail_tools:
    raise ValueError("No Gmail tools were found from civic MCP server.")

  all_tools = gmail_tools + [submit_recent_email_subjects]

  model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.1)
  model_with_tools = model.bind_tools(all_tools)

  def call_model(state: MessagesState):
    response = model_with_tools.invoke(state["messages"])
    print("\nModel response:")
    print(response)
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
  workflow.add_node("tools", ToolNode(gmail_tools))

  workflow.add_edge(START, "agent")
  workflow.add_conditional_edges("agent", route_after_agent)
  workflow.add_edge("tools", "agent")

  return workflow.compile(checkpointer=MemorySaver())