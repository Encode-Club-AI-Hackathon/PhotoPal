import os
from typing import List, Optional

# Correct imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState, StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool
# from civic_mcp_client import CivicMCPClient
# from civic_mcp_client.adapters.langchain import execute_langchain_tool_call, langchain

# Import Pydantic for structured output
from pydantic import BaseModel, Field
from .civic_token_exchange import resolve_civic_access_token

import logging

civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")

logging.getLogger("langchain_google_genai").setLevel(logging.ERROR)

# --- 1. Define your exact data structure ---
class BusinessLead(BaseModel):
    business_name: str = Field(description="Name of the business")
    type: str = Field(description="Type of business (e.g., Restaurant, Retail)")
    contact_name: Optional[str] = Field(default=None, description="Name of the contact person if available")
    email_address: str = Field(default=None, description="Email address if available")
    phone_number: Optional[str] = Field(default=None, description="Phone number if available")
    website: str = Field(default=None, description="Website URL if available")
    notes_needs: Optional[str] = Field(default=None, description="Any specific notes or photography needs")
    longitude: float = Field(default=None, description="Longitude of the business location")
    latitude: float = Field(default=None, description="Latitude of the business location")

class LeadList(BaseModel):
    leads: List[BusinessLead] = Field(description="A list of business leads found during the search")


SUBMIT_TOOL_NAME = "submit_final_leads"
RESULTS_KEY = "leads"
TARGET_TABLE = "businesses"


def build_prompt(area: str) -> str:
    location = (area or "").strip() or "the specified local area"

    return (
        f"Find strong business leads in {location}. "
        "This lead list must be reusable across many photographers, so do not tailor results to any individual person. "
        "Prioritize local businesses that are likely to benefit from professional photography or visual content. Make sure you provide the longitude and latitude for each business."
        "Once complete, you MUST call `submit_final_leads` to output your final structured leads."
    )

# --- 2. Create the Submit Tool ---
@tool(args_schema=LeadList)
def submit_final_leads(leads: List[BusinessLead]):
    """Use this tool ONLY when your research is complete to submit the final structured list of business leads."""
    # We actually don't need this function to do anything. 
    # LangGraph will intercept the call before it executes!
    return leads


async def create_agent(civic_access_token: str | None = None):
    active_token = await resolve_civic_access_token(civic_access_token)

    if not civic_url or not active_token:
        raise ValueError("Missing CIVIC_URL or CIVIC_TOKEN in environment.")

    # Setup MCP Client
    client = MultiServerMCPClient({
        "civic-nexus": {
            "transport": "streamable_http",
            "url": civic_url,
                "headers": {"Authorization": f"Bearer {active_token}"},
        }
    })
    
    # client = CivicMCPClient(
    #     auth={"token": civic_token},
    #     url=civic_url
    # )
    
    # Initialize Tools (MCP Tools + Our Custom Submit Tool)
    # mcp_tools = await client.adapt_for(langchain())
    mcp_tools = await client.get_tools()
    all_tools = mcp_tools + [submit_final_leads]
    
    model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.2)
    model_with_tools = model.bind_tools(all_tools)

    # Define Agent Node
    def call_model(state: MessagesState):
        response = model_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    # --- 3. Custom Routing Logic ---
    def route_after_agent(state: MessagesState):
        last_message = state["messages"][-1]
        
        # If the agent didn't call any tools (just replied with text), end the graph
        if not getattr(last_message, "tool_calls", None):
            return END
            
        # Check WHICH tool the agent called
        for tool_call in last_message.tool_calls:
            if tool_call["name"] == SUBMIT_TOOL_NAME:
                # The agent is done and submitting the data. Stop the graph!
                return END
                
        # If it wasn't the submit tool, it's a research tool. Route to execution.
        return "tools"

    # Build Graph
    workflow = StateGraph(MessagesState)
    workflow.add_node("agent", call_model)
    # The ToolNode only needs to execute the MCP tools
    workflow.add_node("tools", ToolNode(mcp_tools))
    
    workflow.add_edge(START, "agent")
    
    # Use our custom router instead of the default tools_condition
    workflow.add_conditional_edges("agent", route_after_agent)
    
    workflow.add_edge("tools", "agent")
    
    return workflow.compile(checkpointer=MemorySaver())