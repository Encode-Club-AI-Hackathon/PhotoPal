# PhotoPal

This project was built as part of the [Encode AI London Hackathon 2026](https://www.encodeclub.com/programmes/ai-london-2026).


PhotoPal is an agentic AI platform that helps photographers analyse their portfolio, discover qualified business leads, match opportunities to their style, and generate tailored outreach drafts.

Built on Luffa App and secured by Civic, the product combines a client experience with AI agents that run structured research workflows and persist results to Supabase.

## Table of Contents

- [Why PhotoPal](#why-photopal)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [AI Agents](#ai-agents)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [1) Backend Setup (FastAPI + Agents)](#1-backend-setup-fastapi--agents)
- [2) Luffa App Setup](#2-luffa-app-setup)
- [API Endpoints](#api-endpoints)
- [Authentication Notes](#authentication-notes)
- [Data Flow Summary](#data-flow-summary)
- [Development Notes](#development-notes)
- [Roadmap Ideas](#roadmap-ideas)
- [References](#references)

## Why PhotoPal

Photographers often spend too much time on manual prospecting and generic outreach.
PhotoPal automates that workflow in four steps:

1. Analyze a photographer portfolio to understand market fit and positioning.
2. Find nearby businesses that likely need visual content.
3. Match the best opportunities to each photographer profile.
4. Generate personalized outreach drafts mapped to each matched lead.

## Core Features

- Portfolio analysis into structured profile data.
- Agentic lead discovery for local opportunities.
- Profile-to-lead fit matching.
- Business-level research and outreach draft generation.
- Civic-backed auth and token exchange support.
- Supabase persistence for leads, profiles, and drafts.
- Luffa mini program UI for onboarding and opportunity review.

## System Architecture

PhotoPal is split into two main applications:

- LuffaApp mini program frontend
	- Photographer onboarding and profile intake.
	- Suggested opportunities list and map links.
	- Calls backend agent endpoints.
- Python FastAPI backend
	- Agent endpoints under /agents/*.
	- Civic auth routes and device flow helpers.
	- LangGraph-based agents with MCP tools.
	- Supabase persistence for agent outputs.

## AI Agents

### 1) Profile Analyser

- Input: portfolio website and optional Instagram handle.
- Output: structured photographer profile attributes.
- Target table: photographer_profiles.

### 2) Business Finder

- Input: area or city.
- Output: structured local business leads.
- Target table: businesses.

### 3) Match Maker

- Input: photographer profile + discovered business leads.
- Output: prioritized profile-to-business matches with fit rationale.
- Role: ranking layer between discovery and outreach.

### 4) Outreach Generator

- Input: business id and photographer profile id.
- Output: fit scoring, research summary, and custom cold outreach draft.
- Target table: business_outreach_emails.

## Tech Stack

- Frontend: Luffa mini program (JavaScript, WXML, WXSS).
- Backend API: FastAPI + Uvicorn.
- Agent runtime: LangGraph + LangChain MCP adapters.
- Model: Gemini via langchain_google_genai.
- Data layer: Supabase.
- Auth and identity: Civic OAuth and token exchange.

## Project Structure

```
PhotoPal/
	backend/
		agents/
			lead_finder.py
			portfolio_analyser.py
			business_outreach_researcher.py
			main.py
			civic_token_exchange.py
		api/
			server.py
			routes/
				lead_finder.py
				portfolio_analyser.py
				business_outreach.py
				auth_utils.py
		core/
			supabase_client.py
		requirements.txt

	LuffaApp/
		config/
			agent_api.js
			supabase.js
			maps.js
			env.generated.js
		pages/
			profile-intake/
			suggested-opportunities/
			settings/
			profile/
			index/
			webview/
		scripts/
			sync-env-to-config.js
```

## Setup

## 1) Backend Setup (FastAPI + Agents)

From the backend directory:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create backend/.env with the required values:

```env
SUPABASE_URL=
SUPABASE_KEY=

CIVIC_URL=
CIVIC_TOKEN=
CIVIC_CLIENT_ID=
CIVIC_CLIENT_SECRET=

PUBLIC_BASE_URL=http://127.0.0.1:8000
CIVIC_REDIRECT_URL=http://127.0.0.1:8000/auth/callback
CIVIC_POST_LOGOUT_REDIRECT_URL=http://127.0.0.1:8000/

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URL=http://127.0.0.1:8000/auth/google/callback
```

Run the API:

```bash
uvicorn api.server:app --reload --host 0.0.0.0 --port 8000
```

Health check:

- GET /health

## 2) Luffa App Setup

Inside LuffaApp, create a local env file from the example:

```bash
cd LuffaApp
cp .env.example .env
```

Fill these values:

```env
LUFFA_SUPABASE_URL=
LUFFA_SUPABASE_ANON_KEY=
LUFFA_MAPBOX_ACCESS_TOKEN=
LUFFA_MAPBOX_STYLE_ID=mapbox/streets-v12
LUFFA_AGENT_API_BASE_URL=http://127.0.0.1:8000
```

Generate runtime config for the mini program:

```bash
node scripts/sync-env-to-config.js
```

Then open LuffaApp in Luffa Tools or your configured mini program IDE and run the project.

## API Endpoints

All agent endpoints are mounted under /agents.

### POST /agents/lead-finder

Request:

```json
{
	"area": "Bristol, UK"
}
```

### POST /agents/portfolio-analyser

Request:

```json
{
	"website_url": "https://example-portfolio.com",
	"instagram_handle": "photographer_handle",
	"photographer_id": "wallet_uid"
}
```

### POST /agents/business-outreach

Request:

```json
{
	"business_id": 123,
	"photographer_id": 456
}
```

## Authentication Notes

- Backend supports Civic login, callback, logout, and device flow routes.
- Agent routes accept Bearer tokens and can exchange non-Civic subject tokens for Civic access tokens.
- In local hackathon mode, a static CIVIC_TOKEN fallback is supported.

## Data Flow Summary

1. User completes profile intake in LuffaApp.
2. Frontend calls /agents/portfolio-analyser.
3. Profile data is saved in photographer_profiles.
4. Business Finder populates businesses.
5. Match Maker ranks the best profile-to-business opportunities.
6. Outreach Generator combines business + profile context to produce business_outreach_emails.
7. Suggested opportunities page surfaces matched leads for action.

## Development Notes

- API route responses use JSONResponse with jsonable_encoder for reliable serialization.
- The portfolio agent excludes store-save style tools that can fail in non-interactive backend sessions.
- Main agent runner supports CLI execution via backend/agents/main.py for local testing.

## Roadmap Ideas

- Add ranking and recommendation logic per photographer.
- Add email send integration and follow-up cadence tracking.
- Move in-memory device sessions to Redis for production reliability.
- Add tests for route contracts and agent result validation.

## References

- [LuffaMiniApp_Template GitHub Repositroy](https://github.com/BabyBoss45/LuffaMiniApp_Template/tree/main)
- [Luffa SuperBox Documentation](https://uk.luffa.im/docs/quickStartGuide/quickStartGuide.html)
- [Civic Documentation](https://docs.civic.com/?_gl=1*zq7beh*_up*MQ..*_ga*MTk2ODEzMzAyMS4xNzc0MTU3Njgy*_ga_EN41CJBWQV*czE3NzQxNTc2ODIkbzEkZzAkdDE3NzQxNTc2ODIkajYwJGwwJGgzOTE3MzU1NzY.)
