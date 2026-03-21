import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from supabase import create_client, Client


env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
	raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment.")

supabase: Client = create_client(supabase_url, supabase_key)


def extract_submit_payload(result: dict[str, Any], submit_tool_name: str) -> dict[str, Any] | None:
	last_message = result["messages"][-1]
	if getattr(last_message, "tool_calls", None):
		for tool_call in last_message.tool_calls:
			if tool_call["name"] == submit_tool_name:
				return tool_call["args"]
	return None


async def run_and_store(
	*,
	create_agent: Callable[[], Awaitable[Any]],
	prompt: str,
	submit_tool_name: str,
	results_key: str,
	target_table: str,
	thread_id: str,
) -> None:
	agent = await create_agent()
	config = {"configurable": {"thread_id": thread_id}}

	print(f"Running agent for table '{target_table}'...")

	result = await agent.ainvoke(
		{"messages": [{"role": "user", "content": prompt}]},
		config=config,
	)

	structured_data = extract_submit_payload(result, submit_tool_name)
	if not structured_data:
		last_message = result["messages"][-1]
		print("\nAgent did not use the submit tool. Raw response:")
		print(last_message.content)
		return

	print("\n--- STRUCTURED JSON OUTPUT ---")
	print(json.dumps(structured_data, indent=2))

	rows = structured_data.get(results_key, [])
	if not rows:
		print(f"No rows found under '{results_key}'. Nothing to insert.")
		return

	supabase.table(target_table).insert(rows).execute()
	print(f"Inserted {len(rows)} row(s) into '{target_table}'.")


async def run_lead_finder() -> None:
	try:
		from .lead_finder import (
			create_agent,
			LEAD_FINDER_PROMPT,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		from lead_finder import (  # type: ignore
			create_agent,
			LEAD_FINDER_PROMPT,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)

	await run_and_store(
		create_agent=create_agent,
		prompt=LEAD_FINDER_PROMPT,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id="lead-finder-session",
	)


async def run_portfolio_analyser() -> None:
	try:
		from .portfolio_analyser import (
			create_agent,
			PORTFOLIO_ANALYSER_PROMPT,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		from portfolio_analyser import (  # type: ignore
			create_agent,
			PORTFOLIO_ANALYSER_PROMPT,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)

	await run_and_store(
		create_agent=create_agent,
		prompt=PORTFOLIO_ANALYSER_PROMPT,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id="portfolio-analyser-session",
	)


async def main(agent: str) -> None:
	if agent in {"lead-finder", "all"}:
		await run_lead_finder()
	if agent in {"portfolio-analyser", "all"}:
		await run_portfolio_analyser()


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="Run PhotoPal agents and persist output to Supabase.")
	parser.add_argument(
		"--agent",
		choices=["lead-finder", "portfolio-analyser", "all"],
		default="all",
		help="Choose which agent to run.",
	)
	args = parser.parse_args()
	asyncio.run(main(args.agent))
