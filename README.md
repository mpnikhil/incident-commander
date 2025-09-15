# Nightrider MVP — SRE Agent

An AI-powered Site Reliability Engineering (SRE) agent built with the Raindrop framework. It ingests incidents, performs agentic analysis using GPT, calls tooling (logs, metrics, remediation, notifications), and stores the root-cause analysis (RCA) and actions in a simple SQL table. A lightweight embedded UI is served for demo.

## Overview
- **Core service**: `sre-agent` (TypeScript + Hono) exposes `/incidents` APIs and an embedded demo UI at `/` and `/ui`.
- **AI**: `gpt-oss-120b` via Raindrop `env.AI.run()` with a structured, iterative tool-calling loop.
- **Tools**: Invoked via Raindrop ServiceStub to `tools-api` (no external HTTP dependency during agent loop).
- **DB**: One table `incidents` (id, status, title, description, severity, trace_id, timestamps, rca_analysis, actions_taken, metadata).
- **Tracing/Logging**: Every request gets a `traceId`. Pretty, structured logs highlight steps, tool calls, and results.

For product context, see `PRD.md`.

## Architecture
- **Single service**: `sre-agent`
  - HTTP endpoints using Hono
  - Agent loop with prompt-embedded tool definitions
  - Calls tools via `env.TOOLS_API` (ServiceStub RPCs)
- **Minimal tools service**: `tools-api`
  - Provides simulated implementations: map alert → runbook, get logs, get metrics, restart pod, send notification
  - Also responds `200` for generic HTTP checks (e.g., health probes)
- **Data storage**: SQL table managed by Raindrop `SqlDatabase` (`env.INCIDENTS_DB`)

## Repository layout
```
/src
  /sre-agent        # SRE Agent service (HTTP + agent loop + UI)
  /tools-api        # Tools service (ServiceStub RPC targets)
  /mapping-mcp      # (Scaffold) MCP server — mapping
  /observability-mcp# (Scaffold) MCP server — observability
  /remediation-mcp  # (Scaffold) MCP server — remediation
/db/incidents-db    # SQL migration(s) for incidents table
/dist               # Transpiled JS output (tsc -b)
/prisma             # Prisma → Kysely typegen config (driver adapter pattern)
```

## Requirements
- Node.js 20+ (LTS recommended)
- pnpm or npm (examples use pnpm)
- Raindrop CLI and environment (for running services and SQL resource)

## Setup
```bash
# install deps
pnpm install

# build TypeScript → dist/
pnpm run build
```

The SQL schema for `incidents` is in `db/incidents-db/0001_create_incidents.sql`. In Raindrop, provision the SQL resource and apply this DDL (Raindrop can run migrations via its `sql` resource). Prisma here is used only for Kysely typegen (no local DB connection needed).

## Running (Raindrop)
This app is designed to run inside Raindrop with:
- Service `sre-agent`
- Service `tools-api`
- SQL resource `incidents_db`

High-level steps (refer to your Raindrop environment):
- Configure app per `raindrop.manifest*` files.
- Deploy or run `sre-agent` and `tools-api`.
- Ensure `env.INCIDENTS_DB`, `env.TOOLS_API`, `env.AI`, and `env.logger` are available to services.

When running, the agent also serves a demo UI at `/` and `/ui`.

## API
Base path is the deployed `sre-agent` service URL.

- POST `/incidents` — create incident and trigger synchronous analysis
  - Body:
    ```json
    { "title": "...", "description": "...", "severity": "low|medium|high|critical" }
    ```
  - Responses:
    - 200: `{ incident, traceId, message }` (analysis successful)
    - 200: `{ incident, traceId, message, error }` (created but analysis failed)
    - 400: `{ error: "Title is required" }`
    - 500: `{ error: "Failed to create incident" }`

- GET `/incidents/:id` — fetch a specific incident
  - 200: `{ incident, traceId }`
  - 404: `{ error: "Incident not found" }`
  - 500: `{ error: "Failed to fetch incident" }`

- GET `/incidents` — list incidents
  - 200: `{ incidents, count, traceId }`

Notes:
- Fields `rca_analysis` and `actions_taken` are JSON strings in the DB; client/UI can parse to objects.
- The service assigns a `traceId` per request for log correlation.

### Curl examples
```bash
# Create an incident
curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User API Pod OOM Error",
    "description": "Excessive GC detected, high heap usage",
    "severity": "critical"
  }'

# Get an incident
curl -s "$BASE_URL/incidents/$INCIDENT_ID"

# List incidents
curl -s "$BASE_URL/incidents"
```

## Demo UI
- Navigate to `/` or `/ui` on the `sre-agent` service to:
  - Trigger sample incidents (OOM, DB outage, High CPU, Unknown)
  - Create a custom incident
  - Browse recent incidents and view RCA + actions

## Tooling model
The agent embeds OpenAI-style tool definitions in the prompt and expects JSON-only replies. It executes any returned `tool_calls` by invoking the `tools-api` via `env.TOOLS_API`:
- `map_alert_to_runbook`
- `get_logs`
- `get_metrics`
- `restart_pod`
- `send_notification`

The default `tools-api` provides simulated results for demo/testing.

## Database schema
From `db/incidents-db/0001_create_incidents.sql`:
```sql
CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'new',
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    trace_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    rca_analysis TEXT,
    actions_taken TEXT,
    metadata TEXT
);
```

## Testing
- `test-runbook-flow.sh` — Runbook-guided workflow incl. tool-call verification (requires Raindrop CLI for log queries if you want log validation)
