import asyncio
import os
import json
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional

# Correct imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState, StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_core.tools import tool

# Import Pydantic for structured output
from pydantic import BaseModel, Field

from supabase import create_client, Client

# Load Env
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")
google_api_key = os.getenv("GOOGLE_API_KEY")
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(supabase_url, supabase_key)

# --- 1. Define your exact data structure ---
class BusinessLead(BaseModel):
    business_name: str = Field(description="Name of the business")
    type: str = Field(description="Type of business (e.g., Restaurant, Retail)")
    contact_name: Optional[str] = Field(default=None, description="Name of the contact person if available")
    email_address: str = Field(default=None, description="Email address if available")
    phone_number: Optional[str] = Field(default=None, description="Phone number if available")
    website: str = Field(default=None, description="Website URL if available")
    notes_needs: Optional[str] = Field(default=None, description="Any specific notes or photography needs")
    lon: float = Field(default=None, description="Longitude of the business location")
    lat: float = Field(default=None, description="Latitude of the business location")

class LeadList(BaseModel):
    leads: List[BusinessLead] = Field(description="A list of business leads found during the search")

# --- 2. Create the Submit Tool ---
@tool(args_schema=LeadList)
def submit_final_leads(leads: List[BusinessLead]):
    """Use this tool ONLY when your research is complete to submit the final structured list of business leads."""
    # We actually don't need this function to do anything. 
    # LangGraph will intercept the call before it executes!
    pass


async def create_agent():
    # Setup MCP Client
    client = MultiServerMCPClient({
        "civic-nexus": {
            "transport": "streamable_http",
            "url": civic_url,
            "headers": {"Authorization": f"Bearer {civic_token}"},
        }
    })
    
    # Initialize Tools (MCP Tools + Our Custom Submit Tool)
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
            if tool_call["name"] == "submit_final_leads":
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


async def main():
    agent = await create_agent()
    config = {"configurable": {"thread_id": "session-1"}}

    print("Agent is researching...")
    
    # Notice we updated the prompt to explicitly tell the agent about its new tool
    prompt = """Search the web for businesses in exeter. Use the photographer-lead-finder skill. 
    Once you have compiled the leads, you MUST call the `submit_final_leads` tool to output your results."""
    
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": prompt}]},
        config=config
    )
    
    # --- 4. Extract the cleanly formatted data ---
    last_message = result["messages"][-1]
    structured_data = None
    
    if getattr(last_message, "tool_calls", None):
        for tc in last_message.tool_calls:
            if tc["name"] == "submit_final_leads":
                # The tool arguments ARE our perfect JSON dictionary
                structured_data = tc["args"]
                break

    if structured_data:
        print("\n--- STRUCTURED JSON OUTPUT ---")
        print(json.dumps(structured_data, indent=2))

        for lead in structured_data["leads"]:
            print(f"Lat: {lead['lat']}, Lon: {lead['lon']} - {lead['business_name']} ({lead['type']})")
        
        supabase.table("businesses").insert(structured_data["leads"]).execute()
        
    else:
        print("\nAgent didn't use the submit tool. Here is its raw response:")
        print(last_message.content)


if __name__ == "__main__":
    asyncio.run(main())