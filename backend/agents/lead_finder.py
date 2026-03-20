import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

# Correct imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState, StateGraph, START
from langgraph.prebuilt import ToolNode, tools_condition

# Load Env
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

civic_token = os.getenv("CIVIC_TOKEN")
civic_url = os.getenv("CIVIC_URL")
google_api_key = os.getenv("GEMINI_API_KEY")

async def create_agent():
    # 1. Setup MCP Client
    client = MultiServerMCPClient({
        "civic-nexus": {
            "transport": "streamable_http",
            "url": civic_url,
            "headers": {"Authorization": f"Bearer {civic_token}"},
        }
    })
    
    # 2. Initialize Tools & Model
    tools = await client.get_tools()
    
    # Ensure you use the correct model name string
    model = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.2)
    
    # CRITICAL: Bind the tools to the model
    model_with_tools = model.bind_tools(tools)

    # 3. Define Logic
    def call_model(state: MessagesState):
        # Use the model that has tools bound to it
        response = model_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    # 4. Build Graph
    workflow = StateGraph(MessagesState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", ToolNode(tools))
    
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", tools_condition)
    workflow.add_edge("tools", "agent")
    
    return workflow.compile(checkpointer=MemorySaver())

async def main():
    agent = await create_agent()
    config = {"configurable": {"thread_id": "session-1"}}

    # Use ainvoke for async execution
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "Search the web for businesses in exeter. Use the Photographer Lead Finder skill."}]},
        config=config
    )
    print(result["messages"][-1].content)

if __name__ == "__main__":
    asyncio.run(main())