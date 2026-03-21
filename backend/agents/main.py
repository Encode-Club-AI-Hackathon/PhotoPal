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


def get_single_row(table: str, key: str, value: Any) -> dict[str, Any]:
	response = supabase.table(table).select("*").eq(key, value).limit(1).execute()
	rows = response.data or []
	if not rows:
		raise ValueError(f"No row found in '{table}' where {key}={value}.")
	return rows[0]

def set_single_row(table: str, key: str, value: Any, data: dict[str, Any]) -> dict[str, Any]:
	existing = get_single_row(table, key, value)
	if existing:
		response = supabase.table(table).update(data).eq(key, value).execute()
	else:
		response = supabase.table(table).insert({**data, key: value}).execute()
	return response.data


async def run_and_store(
	*,
	create_agent: Callable[[], Awaitable[Any]],
	prompt: str,
	submit_tool_name: str,
	results_key: str,
	target_table: str,
	thread_id: str,
	row_transform: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, Any]:
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
		return {
			"ok": False,
			"target_table": target_table,
			"inserted_count": 0,
			"error": "Agent did not call submit tool",
			"raw_response": last_message.content,
		}

	print("\n--- STRUCTURED JSON OUTPUT ---")
	print(json.dumps(structured_data, indent=2))

	rows = structured_data.get(results_key, [])
	if not rows:
		print(f"No rows found under '{results_key}'. Nothing to insert.")
		return {
			"ok": True,
			"target_table": target_table,
			"inserted_count": 0,
			"data": structured_data,
		}

	if row_transform:
		rows = [row_transform(row) for row in rows]

	supabase.table(target_table).insert(rows).execute()
	print(f"Inserted {len(rows)} row(s) into '{target_table}'.")
	return {
		"ok": True,
		"target_table": target_table,
		"inserted_count": len(rows),
		"data": structured_data,
	}


async def run_lead_finder(profile_id: int) -> dict[str, Any]:
	try:
		from .lead_finder import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		from lead_finder import (  # type: ignore
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)

	profile = get_single_row("photographer_profiles", "photographer_id", profile_id)
	prompt = build_prompt(profile)

	return await run_and_store(
		create_agent=create_agent,
		prompt=prompt,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id=f"lead-finder-session-{profile_id}",
	)


async def run_portfolio_analyser(website_url: str, instagram_handle: str | None) -> dict[str, Any]:
	try:
		from .portfolio_analyser import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		from portfolio_analyser import (  # type: ignore
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)

	prompt = build_prompt(website_url, instagram_handle)

	return await run_and_store(
		create_agent=create_agent,
		prompt=prompt,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id="portfolio-analyser-session",
	)


async def run_business_outreach(business_id: int, profile_id: int) -> dict[str, Any]:
	try:
		from .business_outreach_researcher import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		from business_outreach_researcher import (  # type: ignore
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)

	business = get_single_row("businesses", "id", business_id)
	profile = get_single_row("photographer_profiles", "photographer_id", profile_id)
	prompt = build_prompt(business, profile)

	def outreach_row_transform(row: dict[str, Any]) -> dict[str, Any]:
		row["business_id"] = business_id
		row["photographer_profile_id"] = profile_id
		return row

	return await run_and_store(
		create_agent=create_agent,
		prompt=prompt,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id=f"business-outreach-session-{business_id}-{profile_id}",
		row_transform=outreach_row_transform,
	)


async def main(
	agent: str,
	profile_id: int | None,
	business_id: int | None,
	website_url: str | None,
	instagram_handle: str | None,
) -> dict[str, Any] | None:
	if agent in {"lead-finder", "all"}:
		if profile_id is None:
			raise ValueError("lead-finder requires --profile-id")
		result = await run_lead_finder(profile_id)
		if agent != "all":
			return result
	if agent in {"portfolio-analyser", "all"}:
		if not website_url:
			raise ValueError("portfolio-analyser requires --website-url")
		result = await run_portfolio_analyser(website_url, instagram_handle)
		if agent != "all":
			return result
	if agent in {"business-outreach", "all"}:
		if business_id is None:
			raise ValueError("business-outreach requires --business-id")
		if profile_id is None:
			raise ValueError("business-outreach requires --profile-id")
		result = await run_business_outreach(business_id, profile_id)
		if agent != "all":
			return result
	return None


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="Run PhotoPal agents and persist output to Supabase.")
	parser.add_argument(
		"--agent",
		choices=["lead-finder", "portfolio-analyser", "business-outreach", "all"],
		default="all",
		help="Choose which agent to run.",
	)
	parser.add_argument("--profile-id", type=int, help="photographer_profiles.photographer_id")
	parser.add_argument("--business-id", type=int, help="businesses.id")
	parser.add_argument("--website-url", type=str, help="Portfolio website URL")
	parser.add_argument("--instagram-handle", type=str, help="Instagram handle without @")
	args = parser.parse_args()
	asyncio.run(
		main(
			agent=args.agent,
			profile_id=args.profile_id,
			business_id=args.business_id,
			website_url=args.website_url,
			instagram_handle=args.instagram_handle,
		)
	)
