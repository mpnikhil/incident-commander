# Technical Product Requirements Document (PRD) - SRE Agent MVP

## Overview

Building an AI-powered Site Reliability Engineering (SRE) Agent using Raindrop. **Single service architecture** with GPT at the core, supported by 3 MCP servers for tooling. **NO AUTH, NO DOMAINS** - compact MVP focused implementation.

## Architecture

### SINGLE SERVICE: `sre-agent`
- **Language**: TypeScript (Raindrop's native language)
- **HTTP Service**: Basic service for API endpoints with Hono.js
- **AI**: `gpt-oss-120b` for intelligent reasoning and autonomous decision-making
- **Database**: One simple SQL table
- **Logging**: Comprehensive logging with trace IDs for debugging and demo

### 3 MCP SERVERS (Tools Only)
1. **mapping-mcp**: Maps alerts → services/runbooks
2. **observability-mcp**: Gets logs/metrics
3. **remediation-mcp**: Restart pods, send notifications

## Raindrop Manifest

```hcl
application "nightrider-mvp" {

  service "sre-agent" {
    # No domain, no auth - just basic service
  }

  sql "incidents_db" {}

  mcp_service "mapping-mcp" {}
  mcp_service "observability-mcp" {}
  mcp_service "remediation-mcp" {}
}
```

## Data Model (One Table)

```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY,
  status VARCHAR(50), -- 'new', 'analyzing', 'resolved', 'failed'
  title VARCHAR(255),
  description TEXT,
  severity VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  rca_analysis JSONB, -- Root cause analysis result
  actions_taken JSONB, -- Array of actions performed
  metadata JSONB -- Additional incident data
);
```

## API Endpoints

- `POST /incidents` - Create incident (triggers GPT workflow)
- `GET /incidents/:id` - Get incident with full timeline
- `GET /incidents` - List all incidents

## Workflow (With Autonomous Actions & Logging)

1. **POST /incidents** → Save to database with trace ID
2. **GPT Analysis** (all logged with trace ID):
   - Calls mapping-mcp to identify service/runbook
   - Calls observability-mcp to gather logs/metrics
   - Performs root cause analysis
3. **GPT Decision Making** (logged):
   - **OOM Case**: GPT autonomously calls remediation-mcp to restart pods
   - **DB Outage**: GPT only sends notification (no autonomous DB actions)
4. **Update Database**: GPT saves RCA + actions taken with timestamps
5. **GET /incidents** shows full incident timeline with all actions and logs

## User Stories

### Database Outage (Semi-autonomous)
GPT → analyzes → **notification only** (human approval needed for DB fixes)
- Trace ID tracks entire workflow
- Logs show decision not to take autonomous action

### OOM Crash (Fully autonomous)
GPT → analyzes → **automatically restarts pods** + sends notification
- Trace ID tracks pod restart action
- Logs show autonomous decision and execution

## MCP Tool Specifications

### mapping-mcp Tools
- `map-alert-to-service(alertType: string): ServiceInfo`
- `get-runbook(serviceName: string): RunbookContent`

### observability-mcp Tools
- `get-logs(serviceName: string, timeRange: string): LogData`
- `get-metrics(serviceName: string): MetricData`

### remediation-mcp Tools
- `restart-pod(podName: string): ActionResult` ← GPT calls autonomously for OOM
- `send-notification(message: string, severity: string): NotificationResult`

## Technical Requirements

- **Compact MVP Code**: No bloat, focused implementation
- **Comprehensive Logging**: All actions logged with trace IDs for debugging/demo
- **AI**: `gpt-oss-120b` via `env.AI.run()`
- **Storage**: Single SQL table with JSONB for flexibility
- **Framework**: Hono.js for HTTP handling
- **Testing**: Step-by-step testing at each implementation phase

## Success Criteria

✅ Single service handles both incident types
✅ GPT produces accurate RCA with full logging
✅ Autonomous pod restart for OOM (logged)
✅ Safe notification-only for DB issues (logged)
✅ Trace IDs allow end-to-end debugging
✅ Compact, demo-ready implementation

## Implementation Plan

1. **Step 1**: Basic service + database setup
2. **Step 2**: Simple incident CRUD APIs
3. **Step 3**: First MCP server (mapping-mcp)
4. **Step 4**: Second MCP server (observability-mcp)
5. **Step 5**: Third MCP server (remediation-mcp)
6. **Step 6**: GPT integration + tool calling loop
7. **Step 7**: Autonomous decision logic
8. **Step 8**: End-to-end testing with both scenarios

Each step includes testing before proceeding to the next.