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


def _normalize_text(value: Any) -> str:
	return f"{value or ''}".strip().lower()


def _to_niche_list(value: Any) -> list[str]:
	if isinstance(value, list):
		return [item.strip() for item in (f"{v}" for v in value) if item.strip()]
	if isinstance(value, str):
		parts = [item.strip() for item in value.split(',')]
		return [item for item in parts if item]
	return []


def _distance_to_km(row: dict[str, Any]) -> float:
	raw = row.get("distance")
	if raw is None:
		raw = row.get("distance_m")
	if raw is None:
		raw = row.get("distance_meters")
	if raw is None:
		return float("inf")
	try:
		meters = float(raw)
	except (TypeError, ValueError):
		return float("inf")
	return meters / 1000.0


def _rank_businesses(profile: dict[str, Any], businesses: list[dict[str, Any]]) -> list[dict[str, Any]]:
	primary_niche = _normalize_text(profile.get("primary_niche"))
	secondary_niches = {_normalize_text(item) for item in _to_niche_list(profile.get("secondary_niches"))}
	secondary_niches = {item for item in secondary_niches if item}

	ranked: list[dict[str, Any]] = []
	for row in businesses:
		business_type = _normalize_text(row.get("type"))
		distance_km = _distance_to_km(row)

		primary_match = bool(primary_niche and business_type == primary_niche)
		secondary_match = bool(business_type and business_type in secondary_niches)
		type_match = bool(primary_match or secondary_match)

		niche_score = 60 if primary_match else 35 if secondary_match else 0
		distance_score = max(0.0, 40.0 - min(distance_km, 40.0)) if distance_km != float("inf") else 0.0
		match_score = round(niche_score + distance_score, 2)

		if primary_match:
			reason = "Primary niche and business type match"
		elif secondary_match:
			reason = "Secondary niche and business type match"
		else:
			reason = "Nearby business"

		row["distance_km"] = None if distance_km == float("inf") else round(distance_km, 2)
		row["primary_niche_match"] = primary_match
		row["secondary_niche_match"] = secondary_match
		row["business_type_match"] = type_match
		row["match_score"] = match_score
		row["match_reason"] = reason
		ranked.append(row)

	ranked.sort(key=lambda item: (-float(item.get("match_score", 0.0)), float(item.get("distance_km") or 10_000_000.0)))
	return ranked


def _call_suggest_businesses_rpc(photographer_id: Any, radius_meters: int, limit: int) -> list[dict[str, Any]]:
	rpc_attempts = [
		{"photographer_id": photographer_id, "search_radius_meters": radius_meters, "result_limit": limit},
		{"photographer_id": photographer_id, "radius_meters": radius_meters, "limit_count": limit},
		{"photographer_id": photographer_id, "radius_meters": radius_meters, "limit": limit},
	]

	last_error: Exception | None = None
	for payload in rpc_attempts:
		try:
			response = supabase.rpc("suggest_businesses_for_photographer", payload).execute()
			if isinstance(response.data, list):
				return response.data
			return []
		except Exception as exc:
			last_error = exc

	error_detail = f" {last_error}" if last_error else ""
	raise ValueError(
		"Unable to query spatial matches. Ensure RPC 'suggest_businesses_for_photographer' exists and accepts photographer_id/radius/limit parameters."
		+ error_detail
	)


async def run_and_store(
	*,
	create_agent: Callable[..., Awaitable[Any]],
	prompt: str,
	submit_tool_name: str,
	results_key: str,
	target_table: str,
	thread_id: str,
	civic_access_token: str | None = None,
	row_transform: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, Any]:
	agent = await create_agent(civic_access_token=civic_access_token)
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
		print(f"Applying row transform to {len(rows)} row(s)...")
		try:
			rows = [row_transform(row) for row in rows]
			print(f"Row transform completed. Rows after transform:")
			print(json.dumps(rows, indent=2, default=str))
		except Exception as e:
			print(f"ERROR during row_transform: {e}")
			raise

	print(f"Inserting {len(rows)} row(s) into '{target_table}'...")
	try:
		response = supabase.table(target_table).insert(rows).execute()
		print(f"Supabase insert response: {response}")
		print(f"Inserted {len(rows)} row(s) into '{target_table}'.")
	except Exception as e:
		print(f"ERROR during Supabase insert: {e}")
		raise
	
	return {
		"ok": True,
		"target_table": target_table,
		"inserted_count": len(rows),
		"data": structured_data,
	}


async def run_lead_finder(
	profile_id: int | str,
	civic_access_token: str | None = None,
	radius_km: float = 20.0,
	limit: int = 5,
) -> dict[str, Any]:
	del civic_access_token  # Lead finding now runs through DB spatial matching.

	if radius_km <= 0:
		raise ValueError("radius_km must be greater than 0")
	if limit <= 0:
		raise ValueError("limit must be greater than 0")

	profile = get_single_row("photographer_profiles", "photographer_id", profile_id)
	radius_meters = int(radius_km * 1000)

	rows = _call_suggest_businesses_rpc(profile_id, radius_meters, limit)
	if not rows:
		return {
			"ok": True,
			"target_table": "businesses",
			"inserted_count": 0,
			"data": {
				"photographer_id": profile_id,
				"radius_km": radius_km,
				"limit": limit,
				"leads": [],
				"matches": [],
			},
		}

	# Backfill richer fields from businesses table when RPC returns minimal columns.
	business_ids = [row.get("id") for row in rows if row.get("id") is not None]
	business_lookup: dict[Any, dict[str, Any]] = {}
	if business_ids:
		biz_res = (
			supabase.table("businesses")
			.select("id,business_name,type,contact_name,email_address,phone_number,website,notes_needs,lon,lat")
			.in_("id", business_ids)
			.execute()
		)
		for business in biz_res.data or []:
			business_lookup[business.get("id")] = business

	merged_rows: list[dict[str, Any]] = []
	for row in rows:
		base = dict(row)
		details = business_lookup.get(base.get("id"), {})
		merged_rows.append({
			"id": base.get("id"),
			"business_name": base.get("business_name") or base.get("name") or details.get("business_name"),
			"type": base.get("type") or details.get("type"),
			"contact_name": base.get("contact_name") or details.get("contact_name"),
			"email_address": base.get("email_address") or details.get("email_address"),
			"phone_number": base.get("phone_number") or details.get("phone_number"),
			"website": base.get("website") or details.get("website"),
			"notes_needs": base.get("notes_needs") or details.get("notes_needs"),
			"lon": base.get("lon") if base.get("lon") is not None else details.get("lon"),
			"lat": base.get("lat") if base.get("lat") is not None else details.get("lat"),
			"distance": base.get("distance") if base.get("distance") is not None else base.get("distance_m") or base.get("distance_meters"),
		})

	ranked = _rank_businesses(profile, merged_rows)

	return {
		"ok": True,
		"target_table": "businesses",
		"inserted_count": 0,
		"data": {
			"photographer_id": profile_id,
			"radius_km": radius_km,
			"limit": limit,
			"leads": ranked[:limit],
			"matches": ranked[:limit],
		},
	}


async def run_portfolio_analyser(
	website_url: str,
	instagram_handle: str | None,
	photographer_id: str | None = None,
	civic_access_token: str | None = None,
) -> dict[str, Any]:
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

	def portfolio_row_transform(row: dict[str, Any]) -> dict[str, Any]:
		if photographer_id:
			row["photographer_id"] = photographer_id
		return row

	return await run_and_store(
		create_agent=create_agent,
		prompt=prompt,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id="portfolio-analyser-session",
		civic_access_token=civic_access_token,
		row_transform=portfolio_row_transform,
	)


async def run_business_outreach(business_id: int, profile_id: int, civic_access_token: str | None = None) -> dict[str, Any]:
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
		civic_access_token=civic_access_token,
		row_transform=outreach_row_transform,
	)


async def run_gmail_recent_subjects(access_token: str | None = None) -> dict[str, Any]:
	try:
		from .gmail_recent_subjects import fetch_recent_email_subjects
	except ImportError:
		from gmail_recent_subjects import fetch_recent_email_subjects  # type: ignore

	if not access_token:
		access_token = os.getenv("GOOGLE_ACCESS_TOKEN")
	if not access_token:
		raise ValueError("Missing Google access token (pass access_token or set GOOGLE_ACCESS_TOKEN)")

	return await fetch_recent_email_subjects(access_token=access_token)


async def main(
	agent: str,
	profile_id: int | None,
	business_id: int | None,
	website_url: str | None,
	instagram_handle: str | None,
	photographer_id: str | None,
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
		result = await run_portfolio_analyser(website_url, instagram_handle, photographer_id)
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
	if agent in {"gmail-recent-subjects"}:
		result = await run_gmail_recent_subjects()
		return result
	return None


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="Run PhotoPal agents and persist output to Supabase.")
	parser.add_argument(
		"--agent",
		choices=["lead-finder", "portfolio-analyser", "business-outreach", "gmail-recent-subjects", "all"],
		default="all",
		help="Choose which agent to run.",
	)
	parser.add_argument("--profile-id", type=int, help="photographer_profiles.photographer_id")
	parser.add_argument("--business-id", type=int, help="businesses.id")
	parser.add_argument("--website-url", type=str, help="Portfolio website URL")
	parser.add_argument("--instagram-handle", type=str, help="Instagram handle without @")
	parser.add_argument("--photographer-id", type=str, help="Photographer ID (wallet UID)")
	args = parser.parse_args()
	asyncio.run(
		main(
			agent=args.agent,
			profile_id=args.profile_id,
			business_id=args.business_id,
			website_url=args.website_url,
			instagram_handle=args.instagram_handle,
			photographer_id=getattr(args, 'photographer_id', None),
		)
	)
