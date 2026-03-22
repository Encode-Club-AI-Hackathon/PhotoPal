import argparse
import asyncio
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
import requests
from supabase import create_client, Client


env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
	raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment.")

supabase: Client = create_client(supabase_url, supabase_key)


def _safe_float(value: Any) -> float | None:
	try:
		parsed = float(value)
	except (TypeError, ValueError):
		return None

	if math.isnan(parsed) or math.isinf(parsed):
		return None

	return parsed


def _normalize_coordinates(latitude_value: Any, longitude_value: Any) -> tuple[float, float] | None:
	latitude = _safe_float(latitude_value)
	longitude = _safe_float(longitude_value)

	if latitude is None or longitude is None:
		return None

	# Guard against rows where lat/lon were accidentally swapped.
	if abs(latitude) > 90 and abs(longitude) <= 90:
		latitude, longitude = longitude, latitude

	if abs(latitude) > 90 or abs(longitude) > 180:
		return None

	return latitude, longitude


def _extract_coordinates(row: dict[str, Any]) -> tuple[float, float] | None:
	latitude_fields = ("latitude", "lat", "lattitude")
	longitude_fields = ("longitude", "lon", "lng", "long")

	latitude_value = None
	longitude_value = None

	for key in latitude_fields:
		if row.get(key) is not None:
			latitude_value = row.get(key)
			break

	for key in longitude_fields:
		if row.get(key) is not None:
			longitude_value = row.get(key)
			break

	return _normalize_coordinates(latitude_value, longitude_value)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
	lat1_rad = math.radians(lat1)
	lon1_rad = math.radians(lon1)
	lat2_rad = math.radians(lat2)
	lon2_rad = math.radians(lon2)

	delta_lat = lat2_rad - lat1_rad
	delta_lon = lon2_rad - lon1_rad

	a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

	return 6371.0 * c


def _geocode_city_coordinates(city: str | None, country: str | None) -> tuple[float, float] | None:
	normalized_city = str(city or "").strip()
	normalized_country = str(country or "").strip()
	if not normalized_city:
		return None

	queries = [f"{normalized_city}, {normalized_country}".strip(", "), normalized_city]
	seen_queries: set[str] = set()
	ordered_queries: list[str] = []
	for query in queries:
		if query and query not in seen_queries:
			seen_queries.add(query)
			ordered_queries.append(query)

	mapbox_token = os.getenv("MAPBOX_ACCESS_TOKEN") or os.getenv("LUFFA_MAPBOX_ACCESS_TOKEN")
	if mapbox_token:
		for query in ordered_queries:
			url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + requests.utils.quote(query) + ".json"
			params = {
				"access_token": mapbox_token,
				"limit": 1,
			}
			try:
				response = requests.get(url, params=params, timeout=8)
				response.raise_for_status()
				payload = response.json()
				features = payload.get("features") or []
				if not features:
					continue
				center = (features[0].get("center") or [])[:2]
				if len(center) != 2:
					continue
				coordinates = _normalize_coordinates(center[1], center[0])
				if coordinates:
					return coordinates
			except Exception:
				continue

	for query in ordered_queries:
		try:
			response = requests.get(
				"https://nominatim.openstreetmap.org/search",
				params={"q": query, "format": "json", "limit": 1},
				headers={"User-Agent": "PhotoPal/1.0"},
				timeout=8,
			)
			response.raise_for_status()
			payload = response.json() or []
			if not payload:
				continue
			first_match = payload[0]
			coordinates = _normalize_coordinates(first_match.get("lat"), first_match.get("lon"))
			if coordinates:
				return coordinates
		except Exception:
			continue

	return None


def _build_business_summary(business: dict[str, Any], fallback_distance_km: float | None = None) -> dict[str, Any]:
	coords = _extract_coordinates(business)
	latitude = coords[0] if coords else None
	longitude = coords[1] if coords else None

	distance_km = _safe_float(fallback_distance_km)

	return {
		"id": business.get("id"),
		"business_name": business.get("business_name"),
		"type": business.get("type"),
		"contact_name": business.get("contact_name"),
		"email_address": business.get("email_address"),
		"phone_number": business.get("phone_number"),
		"website": business.get("website"),
		"notes_needs": business.get("notes_needs"),
		"latitude": latitude,
		"longitude": longitude,
		"distance_km": distance_km,
	}


def _normalize_business_key(row: dict[str, Any]) -> tuple[str, str, str, str]:
	name = str(row.get("business_name") or "").strip().lower()
	website = str(row.get("website") or "").strip().lower()
	business_type = str(row.get("type") or "").strip().lower()

	coords = _extract_coordinates(row)
	if coords:
		coords_key = f"{coords[0]:.5f},{coords[1]:.5f}"
	else:
		coords_key = ""

	return (name, website, business_type, coords_key)


def _dedupe_business_rows(new_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	if not new_rows:
		return []

	existing_response = supabase.table("businesses").select("*").execute()
	existing_rows = existing_response.data or []

	existing_keys = {_normalize_business_key(row) for row in existing_rows}
	seen_keys: set[tuple[str, str, str, str]] = set()
	filtered_rows: list[dict[str, Any]] = []

	for row in new_rows:
		key = _normalize_business_key(row)
		if key in existing_keys or key in seen_keys:
			continue
		seen_keys.add(key)
		filtered_rows.append(row)

	return filtered_rows


def _build_outreach_summary(row: dict[str, Any] | None) -> dict[str, Any] | None:
	if not row:
		return None

	return {
		"id": row.get("id"),
		"email_subject": row.get("email_subject") or "",
		"email_body": row.get("email_body") or "",
		"call_to_action": row.get("call_to_action") or "",
		"fit_rationale": row.get("fit_rationale") or "",
		"created_at": row.get("created_at"),
		"sent_at": row.get("sent_at"),
	}


def _fetch_latest_outreach_by_business(
	photographer_id: str,
	business_ids: list[int],
) -> dict[int, dict[str, Any]]:
	if not business_ids:
		return {}

	response = (
		supabase.table("business_outreach_emails")
		.select("*")
		.eq("photographer_profile_id", photographer_id)
		.in_("business_id", business_ids)
		.execute()
	)
	rows = response.data or []

	best_rows: dict[int, dict[str, Any]] = {}
	for row in rows:
		try:
			business_id = int(row.get("business_id"))
		except (TypeError, ValueError):
			continue

		current = best_rows.get(business_id)
		if not current:
			best_rows[business_id] = row
			continue

		current_created = str(current.get("created_at") or "")
		candidate_created = str(row.get("created_at") or "")
		if candidate_created > current_created:
			best_rows[business_id] = row

	return best_rows


def _build_response_matches_from_connections(
	connection_rows: list[dict[str, Any]],
	limit: int | None,
) -> list[dict[str, Any]]:
	parsed_rows: list[dict[str, Any]] = []
	for row in connection_rows:
		try:
			business_id = int(row.get("business_id"))
		except (TypeError, ValueError):
			continue

		fit_score = _safe_float(row.get("fit_score"))
		if fit_score is None:
			continue

		parsed_rows.append(
			{
				"business_id": business_id,
				"fit_score": max(0.0, min(100.0, fit_score)),
				"explanation_notes": str(row.get("explanation_notes") or "").strip(),
				"distance_km": _safe_float(row.get("distance_km")),
				"match_rank": row.get("match_rank"),
			}
		)

	if not parsed_rows:
		return []

	business_ids = [row["business_id"] for row in parsed_rows]
	business_response = supabase.table("businesses").select("*").in_("id", business_ids).execute()
	business_rows = business_response.data or []
	outreach_map = _fetch_latest_outreach_by_business(
		photographer_id=str(connection_rows[0].get("photographer_id") or ""),
		business_ids=business_ids,
	)
	business_map: dict[int, dict[str, Any]] = {}
	for business in business_rows:
		business_id = business.get("id")
		if business_id is None:
			continue
		try:
			business_map[int(business_id)] = business
		except (TypeError, ValueError):
			continue

	def sort_key(item: dict[str, Any]) -> tuple[int, float, int]:
		rank_raw = item.get("match_rank")
		try:
			rank = int(rank_raw)
		except (TypeError, ValueError):
			rank = 10**6
		return (rank, -float(item.get("fit_score") or 0), item["business_id"])

	parsed_rows.sort(key=sort_key)

	response_matches: list[dict[str, Any]] = []
	for item in parsed_rows:
		business = business_map.get(item["business_id"])
		if not business:
			continue

		response_matches.append(
			{
				"business_id": item["business_id"],
				"fit_score": item["fit_score"],
				"explanation_notes": item["explanation_notes"],
				"business": _build_business_summary(business, item.get("distance_km")),
				"outreach_email": _build_outreach_summary(outreach_map.get(item["business_id"])),
			}
		)

	if limit is None or limit <= 0:
		return response_matches

	return response_matches[:limit]


def _upsert_photographer_business_connections(rows: list[dict[str, Any]]) -> None:
	if not rows:
		return

	try:
		supabase.table("photographer_business_connections").upsert(
			rows,
			on_conflict="photographer_id,business_id",
		).execute()
		return
	except Exception:
		pass

	for row in rows:
		try:
			supabase.table("photographer_business_connections").insert([row]).execute()
		except Exception as exc:
			error_text = str(exc).lower()
			if "duplicate" not in error_text and "already exists" not in error_text and "unique" not in error_text:
				raise

			supabase.table("photographer_business_connections").update(row).eq(
				"photographer_id", row.get("photographer_id")
			).eq("business_id", row.get("business_id")).execute()


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
	create_agent: Callable[..., Awaitable[Any]],
	prompt: str,
	submit_tool_name: str,
	results_key: str,
	target_table: str,
	thread_id: str,
	civic_access_token: str | None = None,
	row_transform: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
	pre_insert_rows: Callable[[list[dict[str, Any]]], list[dict[str, Any]]] | None = None,
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

	if pre_insert_rows:
		print(f"Applying pre-insert filter to {len(rows)} row(s)...")
		try:
			rows = pre_insert_rows(rows)
			print(f"Pre-insert filter completed. Rows remaining: {len(rows)}")
		except Exception as e:
			print(f"ERROR during pre_insert_rows: {e}")
			raise

	if not rows:
		print(f"No rows to insert into '{target_table}' after preprocessing.")
		return {
			"ok": True,
			"target_table": target_table,
			"inserted_count": 0,
			"data": structured_data,
		}

	print(f"Inserting {len(rows)} row(s) into '{target_table}'...")
	try:
		response = supabase.table(target_table).insert(rows).execute()
		print(f"Supabase insert response: {response}")
		print(f"Inserted {len(rows)} row(s) into '{target_table}'.")
	except Exception as e:
		if target_table != "businesses":
			print(f"ERROR during Supabase insert: {e}")
			raise

		error_message = str(e).lower()
		if "duplicate" not in error_message and "already exists" not in error_message and "unique" not in error_message:
			print(f"ERROR during Supabase insert: {e}")
			raise

		print("Duplicate key error inserting businesses. Falling back to row-by-row inserts with duplicate skip...")
		inserted_count = 0
		for row in rows:
			try:
				supabase.table(target_table).insert([row]).execute()
				inserted_count += 1
			except Exception as row_exc:
				row_error = str(row_exc).lower()
				if "duplicate" in row_error or "already exists" in row_error or "unique" in row_error:
					continue
				raise

		print(f"Inserted {inserted_count} new row(s) into '{target_table}' after duplicate filtering.")
		return {
			"ok": True,
			"target_table": target_table,
			"inserted_count": inserted_count,
			"data": structured_data,
		}
	
	return {
		"ok": True,
		"target_table": target_table,
		"inserted_count": len(rows),
		"data": structured_data,
	}


async def run_lead_finder(area: str, civic_access_token: str | None = None) -> dict[str, Any]:
	try:
		from .lead_finder import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		try:
			from agents.lead_finder import (  # type: ignore
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

	normalized_area = (area or "").strip()
	if not normalized_area:
		raise ValueError("lead-finder requires a non-empty area")

	thread_slug = re.sub(r"[^a-z0-9]+", "-", normalized_area.lower()).strip("-") or "local"
	prompt = build_prompt(normalized_area)

	def lead_row_transform(row: dict[str, Any]) -> dict[str, Any]:
		if "lon" in row and "longitude" not in row:
			row["longitude"] = row["lon"]
		if "lat" in row and "lattitude" not in row:
			row["lattitude"] = row["lat"]

		row.pop("lon", None)
		row.pop("lat", None)
		return row

	return await run_and_store(
		create_agent=create_agent,
		prompt=prompt,
		submit_tool_name=SUBMIT_TOOL_NAME,
		results_key=RESULTS_KEY,
		target_table=TARGET_TABLE,
		thread_id=f"lead-finder-session-{thread_slug}",
		civic_access_token=civic_access_token,
		row_transform=lead_row_transform,
		pre_insert_rows=_dedupe_business_rows,
	)


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
		try:
			from agents.portfolio_analyser import (  # type: ignore
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


async def run_business_outreach(business_id: int, profile_id: str, civic_access_token: str | None = None) -> dict[str, Any]:
	try:
		from .business_outreach_researcher import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
			TARGET_TABLE,
		)
	except ImportError:
		try:
			from agents.business_outreach_researcher import (  # type: ignore
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


async def run_business_matcher(
	photographer_id: str,
	city: str | None = None,
	radius_km: float = 20.0,
	limit: int = 5,
	use_cache: bool = True,
	excluded_business_ids: list[int] | None = None,
	civic_access_token: str | None = None,
) -> dict[str, Any]:
	try:
		from .business_matcher import (
			create_agent,
			build_prompt,
			RESULTS_KEY,
			SUBMIT_TOOL_NAME,
		)
	except ImportError:
		try:
			from agents.business_matcher import (  # type: ignore
				create_agent,
				build_prompt,
				RESULTS_KEY,
				SUBMIT_TOOL_NAME,
			)
		except ImportError:
			from business_matcher import (  # type: ignore
				create_agent,
				build_prompt,
				RESULTS_KEY,
				SUBMIT_TOOL_NAME,
			)

	normalized_photographer_id = str(photographer_id or "").strip()
	if not normalized_photographer_id:
		raise ValueError("business-matcher requires photographer_id")

	safe_radius_km = float(radius_km or 20.0)
	if safe_radius_km <= 0:
		raise ValueError("radius_km must be greater than 0")

	safe_limit = int(limit or 5)
	if safe_limit <= 0:
		raise ValueError("limit must be greater than 0")

	excluded_ids: set[int] = set()
	for raw_id in excluded_business_ids or []:
		try:
			excluded_ids.add(int(raw_id))
		except (TypeError, ValueError):
			continue

	if use_cache:
		cached_response = (
			supabase.table("photographer_business_connections")
			.select("*")
			.eq("photographer_id", normalized_photographer_id)
			.order("match_rank", desc=False)
			.order("fit_score", desc=True)
			.execute()
		)
		cached_rows = [
			row
			for row in (cached_response.data or [])
			if int(row.get("business_id") or 0) not in excluded_ids
		]
		cached_matches = _build_response_matches_from_connections(cached_rows, None)
		if cached_matches:
			return {
				"ok": True,
				"photographer_id": normalized_photographer_id,
				"radius_km": safe_radius_km,
				"limit": safe_limit,
				"cached": True,
				"triggered_lead_finder": False,
				"lead_finder_result": None,
				"local_business_count": len(cached_matches),
				"matches": cached_matches,
			}

	profile = get_single_row("photographer_profiles", "photographer_id", normalized_photographer_id)
	profile_coordinates = _extract_coordinates(profile)
	if not profile_coordinates:
		fallback_coordinates = _geocode_city_coordinates(
			profile.get("location_city"),
			profile.get("location_country"),
		)
		if fallback_coordinates:
			profile_coordinates = fallback_coordinates
			try:
				supabase.table("photographer_profiles").update(
					{
						"latitude": fallback_coordinates[0],
						"longitude": fallback_coordinates[1],
					}
				).eq("photographer_id", normalized_photographer_id).execute()
			except Exception:
				pass
	if not profile_coordinates:
		raise ValueError("Photographer profile is missing valid latitude/longitude coordinates")

	search_city = (city or profile.get("location_city") or "").strip()

	def get_local_businesses() -> list[dict[str, Any]]:
		response = supabase.table("businesses").select("*").execute()
		rows = response.data or []
		local_businesses: list[dict[str, Any]] = []

		for business in rows:
			try:
				business_id = int(business.get("id"))
			except (TypeError, ValueError):
				business_id = None

			if business_id is not None and business_id in excluded_ids:
				continue

			business_coordinates = _extract_coordinates(business)
			if not business_coordinates:
				continue

			distance_km = _haversine_km(
				profile_coordinates[0],
				profile_coordinates[1],
				business_coordinates[0],
				business_coordinates[1],
			)

			if distance_km <= safe_radius_km:
				enriched_business = dict(business)
				enriched_business["_distance_km"] = round(distance_km, 3)
				enriched_business["_latitude"] = business_coordinates[0]
				enriched_business["_longitude"] = business_coordinates[1]
				local_businesses.append(enriched_business)

		local_businesses.sort(key=lambda row: row.get("_distance_km", 1e9))
		return local_businesses

	local_businesses = get_local_businesses()
	triggered_lead_finder = False
	lead_finder_result: dict[str, Any] | None = None

	if not local_businesses:
		if not search_city:
			raise ValueError(
				"No businesses found in local radius and photographer location_city is missing for lead finder fallback"
			)

		lead_finder_result = await run_lead_finder(search_city, civic_access_token=civic_access_token)
		triggered_lead_finder = True
		local_businesses = get_local_businesses()

	if not local_businesses:
		return {
			"ok": True,
			"photographer_id": normalized_photographer_id,
			"radius_km": safe_radius_km,
			"limit": safe_limit,
			"triggered_lead_finder": triggered_lead_finder,
			"lead_finder_result": lead_finder_result,
			"local_business_count": 0,
			"matches": [],
		}

	candidate_businesses = local_businesses[:25]
	prompt = build_prompt(profile, candidate_businesses, safe_limit)

	agent = await create_agent(civic_access_token=civic_access_token)
	thread_suffix = re.sub(r"[^a-z0-9]+", "-", normalized_photographer_id.lower()).strip("-") or "photographer"
	result = await agent.ainvoke(
		{"messages": [{"role": "user", "content": prompt}]},
		config={"configurable": {"thread_id": f"business-matcher-session-{thread_suffix}"}},
	)

	structured_data = extract_submit_payload(result, SUBMIT_TOOL_NAME)
	if not structured_data:
		last_message = result["messages"][-1]
		return {
			"ok": False,
			"error": "Agent did not call submit tool",
			"raw_response": last_message.content,
			"triggered_lead_finder": triggered_lead_finder,
			"lead_finder_result": lead_finder_result,
		}

	raw_matches = structured_data.get(RESULTS_KEY, []) or []
	candidate_map: dict[int, dict[str, Any]] = {}
	for business in candidate_businesses:
		business_id = business.get("id")
		if business_id is None:
			continue
		try:
			candidate_map[int(business_id)] = business
		except (TypeError, ValueError):
			continue

	best_by_business_id: dict[int, dict[str, Any]] = {}
	for item in raw_matches:
		try:
			business_id = int(item.get("business_id"))
		except (TypeError, ValueError):
			continue

		if business_id not in candidate_map:
			continue

		fit_score_raw = _safe_float(item.get("fit_score"))
		if fit_score_raw is None:
			continue

		fit_score = max(0.0, min(100.0, fit_score_raw))
		explanation_notes = str(item.get("explanation_notes") or "").strip()

		current = best_by_business_id.get(business_id)
		candidate = {
			"business_id": business_id,
			"fit_score": fit_score,
			"explanation_notes": explanation_notes,
		}

		if not current or candidate["fit_score"] > current["fit_score"]:
			best_by_business_id[business_id] = candidate

	matches = list(best_by_business_id.values())
	matches.sort(key=lambda row: row["fit_score"], reverse=True)
	top_matches = matches[:safe_limit]

	connection_rows: list[dict[str, Any]] = []
	outreach_map = _fetch_latest_outreach_by_business(normalized_photographer_id, [row["business_id"] for row in top_matches])
	response_matches: list[dict[str, Any]] = []
	for rank, match in enumerate(top_matches, start=1):
		business = candidate_map.get(match["business_id"], {})

		connection_rows.append(
			{
				"photographer_id": normalized_photographer_id,
				"business_id": match["business_id"],
				"fit_score": match["fit_score"],
				"explanation_notes": match["explanation_notes"],
				"radius_km": safe_radius_km,
				"distance_km": business.get("_distance_km"),
				"match_rank": rank,
			}
		)

		response_matches.append(
			{
				"business_id": match["business_id"],
				"fit_score": match["fit_score"],
				"explanation_notes": match["explanation_notes"],
				"business": _build_business_summary(business, business.get("_distance_km")),
				"outreach_email": _build_outreach_summary(outreach_map.get(match["business_id"])),
			}
		)

	_upsert_photographer_business_connections(connection_rows)

	return {
		"ok": True,
		"photographer_id": normalized_photographer_id,
		"radius_km": safe_radius_km,
		"limit": safe_limit,
		"cached": False,
		"triggered_lead_finder": triggered_lead_finder,
		"lead_finder_result": lead_finder_result,
		"local_business_count": len(local_businesses),
		"matches": response_matches,
	}


async def main(
	agent: str,
	area: str | None,
	profile_id: int | None,
	business_id: int | None,
	website_url: str | None,
	instagram_handle: str | None,
	photographer_id: str | None,
	radius_km: float,
	limit: int,
) -> dict[str, Any] | None:
	if agent in {"lead-finder", "all"}:
		if not area:
			raise ValueError("lead-finder requires --area")
		result = await run_lead_finder(area)
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
		result = await run_business_outreach(business_id, str(profile_id))
		if agent != "all":
			return result
	if agent in {"business-matcher", "all"}:
		if not photographer_id:
			raise ValueError("business-matcher requires --photographer-id")
		result = await run_business_matcher(
			photographer_id=photographer_id,
			city=area,
			radius_km=radius_km,
			limit=limit,
		)
		if agent != "all":
			return result
	return None


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="Run PhotoPal agents and persist output to Supabase.")
	parser.add_argument(
		"--agent",
		choices=["lead-finder", "portfolio-analyser", "business-outreach", "business-matcher", "all"],
		default="all",
		help="Choose which agent to run.",
	)
	parser.add_argument("--area", type=str, help="Area to find business leads in (e.g. 'Bristol, UK')")
	parser.add_argument("--profile-id", type=int, help="photographer_profiles.photographer_id")
	parser.add_argument("--business-id", type=int, help="businesses.id")
	parser.add_argument("--website-url", type=str, help="Portfolio website URL")
	parser.add_argument("--instagram-handle", type=str, help="Instagram handle without @")
	parser.add_argument("--photographer-id", type=str, help="Photographer ID (wallet UID)")
	parser.add_argument("--radius-km", type=float, default=20.0, help="Radius for local business filtering")
	parser.add_argument("--limit", type=int, default=5, help="Maximum number of matched businesses")
	args = parser.parse_args()
	asyncio.run(
		main(
			agent=args.agent,
			area=args.area,
			profile_id=args.profile_id,
			business_id=args.business_id,
			website_url=args.website_url,
			instagram_handle=args.instagram_handle,
			photographer_id=getattr(args, 'photographer_id', None),
			radius_km=getattr(args, 'radius_km', 20.0),
			limit=getattr(args, 'limit', 5),
		)
	)
