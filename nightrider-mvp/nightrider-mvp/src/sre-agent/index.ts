import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    const app = new Hono();

    // Enable CORS for demo
    app.use('*', cors());

    // Generate trace ID for logging
    const traceId = crypto.randomUUID();

    // Helper to get current timestamp
    const timestamp = () => new Date().toISOString();

    // POST /incidents - Create new incident and trigger GPT analysis
    app.post('/incidents', async (c) => {
      const startTime = Date.now();
      this.env.logger.info('Creating new incident', { traceId, timestamp: timestamp() });

      try {
        const body = await c.req.json();
        const { title, description, severity = 'medium' } = body;

        if (!title) {
          this.env.logger.warn('Incident creation failed - missing title', { traceId });
          return c.json({ error: 'Title is required' }, 400);
        }

        // Create incident record
        const incidentId = crypto.randomUUID();
        const incident = {
          id: incidentId,
          status: 'new',
          title,
          description: description || null,
          severity,
          trace_id: traceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          rca_analysis: null,
          actions_taken: null,
          metadata: null
        };

        // Insert incident using prepared statement
        await this.env.INCIDENTS_DB
          .prepare(`INSERT INTO incidents (id, status, title, description, severity, trace_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(incident.id, incident.status, incident.title, incident.description,
                incident.severity, incident.trace_id, incident.created_at, incident.updated_at)
          .run();

        // Pretty: Incident Created
        this.pretty('Incident Created', incident, traceId);

        this.env.logger.info('Incident created, starting SYNC GPT analysis', {
          traceId,
          incidentId: incident?.id,
          severity,
          duration: Date.now() - startTime
        });

        // Start GPT analysis workflow (SYNCHRONOUS for debugging)
        try {
          await this.analyzeIncident(this.env, incident!, traceId);
          return c.json({
            incident: incident,
            traceId,
            message: 'Incident created and analyzed successfully'
          });
        } catch (error: any) {
          this.env.logger.error('SYNC GPT analysis failed in main handler', {
            traceId,
            error: error.message,
            stack: error.stack,
            incidentId: incident?.id
          });
          return c.json({
            incident: incident,
            traceId,
            message: 'Incident created but analysis failed',
            error: error.message
          });
        }

      } catch (error: any) {
        this.env.logger.error('Incident creation failed', {
          traceId,
          error: error.message,
          duration: Date.now() - startTime
        });
        return c.json({ error: 'Failed to create incident' }, 500);
      }
    });

    // GET /incidents/:id - Get specific incident
    app.get('/incidents/:id', async (c) => {
      const incidentId = c.req.param('id');
      this.env.logger.info('Fetching incident', { traceId, incidentId, timestamp: timestamp() });

      try {
        const incident = await this.env.INCIDENTS_DB
          .prepare('SELECT * FROM incidents WHERE id = ?')
          .bind(incidentId)
          .first();

        if (!incident) {
          return c.json({ error: 'Incident not found' }, 404);
        }

        return c.json({
          incident,
          traceId
        });

      } catch (error: any) {
        this.env.logger.error('Failed to fetch incident', { traceId, error: error.message });
        return c.json({ error: 'Failed to fetch incident' }, 500);
      }
    });

    // GET /incidents - List all incidents
    app.get('/incidents', async (c) => {
      this.env.logger.info('Listing incidents', { traceId, timestamp: timestamp() });

      try {
        const result = await this.env.INCIDENTS_DB
          .prepare('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50')
          .all();
        const incidents = result.results;

        return c.json({
          incidents,
          count: incidents.length,
          traceId
        });

      } catch (error: any) {
        this.env.logger.error('Failed to list incidents', { traceId, error: error.message });
        return c.json({ error: 'Failed to list incidents' }, 500);
      }
    });

    // Simple, embedded UI for hackathon demo
    const uiHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Incident Commander - Demo</title>
  <style>
    :root {
      --bg: #0b0f14;
      --panel: #121923;
      --muted: #9fb0c3;
      --text: #e6edf3;
      --accent: #4f8cff;
      --accent-2: #22c55e;
      --danger: #ef4444;
      --warn: #f59e0b;
      --shadow: 0 8px 24px rgba(0,0,0,0.35);
      --radius: 12px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji; background: linear-gradient(180deg, #0b0f14, #0b0f14 60%, #0e1420); color: var(--text); }
    header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); position: sticky; top: 0; background: rgba(11,15,20,0.85); backdrop-filter: blur(8px); z-index: 10; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; letter-spacing: 0.2px; }
    .brand .dot { width: 10px; height: 10px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, #7cf, #4f8cff); box-shadow: 0 0 24px #4f8cff88; }
    .container { max-width: 1180px; margin: 24px auto; padding: 0 16px; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; }
    @media (max-width: 980px) { .container { grid-template-columns: 1fr; } }
    .card { background: linear-gradient(180deg, #141c27, #101723); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
    .card h2 { margin: 0; padding: 16px 16px; font-size: 16px; font-weight: 600; color: var(--muted); border-bottom: 1px solid rgba(255,255,255,0.06); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)); }
    .content { padding: 16px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .btn { appearance: none; border: 0; padding: 10px 14px; border-radius: 10px; color: white; background: #1b2636; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: transform 0.03s ease, background 0.2s ease, border-color 0.2s ease; }
    .btn:hover { background: #213049; border-color: rgba(255,255,255,0.18); }
    .btn:active { transform: translateY(1px); }
    .btn.primary { background: linear-gradient(180deg, #4f8cff, #3d79ee); border-color: #5a97ff; box-shadow: 0 6px 18px #4f8cff40; }
    .btn.ok { background: linear-gradient(180deg, #22c55e, #18a34a); border-color: #26d368; box-shadow: 0 6px 18px #22c55e40; }
    .btn.warn { background: linear-gradient(180deg, #f59e0b, #d97706); border-color: #f59e0b; }
    .btn.danger { background: linear-gradient(180deg, #ef4444, #dc2626); border-color: #ef4444; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
    .list { display: grid; gap: 10px; }
    .inc { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    .inc:hover { background: rgba(255,255,255,0.045); }
    .inc .title { font-weight: 600; }
    .inc .meta { color: var(--muted); font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
    .pill { font-size: 12px; padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); }
    .pill.ok { border-color: #22c55e66; color: #86efac; background: #052916; }
    .pill.warn { border-color: #f59e0b66; color: #fed7aa; background: #2a1e05; }
    .pill.crit { border-color: #ef444466; color: #fecaca; background: #2b0b0b; }
    .muted { color: var(--muted); }
    .details { background: rgba(0,0,0,0.35); border: 1px dashed rgba(255,255,255,0.12); border-radius: 10px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; font-size: 12px; white-space: pre-wrap; color: #cbd5e1; overflow: auto; max-height: 260px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
    .footer { padding: 12px 16px; color: var(--muted); font-size: 12px; text-align: center; }
    .field { display: grid; gap: 6px; }
    .field input, .field textarea, .field select { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--text); padding: 10px 12px; border-radius: 10px; outline: none; }
    .field textarea { resize: vertical; min-height: 80px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
  </style>
  <script>
    const state = { incidents: [], selected: null, loading: false };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const el = (q) => document.querySelector(q);
    const fmtTime = (s) => new Date(s || Date.now()).toLocaleString();

    async function fetchIncidents() {
      try {
        const res = await fetch('/incidents');
        const data = await res.json();
        state.incidents = Array.isArray(data.incidents) ? data.incidents : [];
        renderList();
      } catch (e) {
        console.error('Failed to fetch incidents', e);
      }
    }

    function parseMaybeJson(value) {
      if (value == null) return null;
      try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
    }

    async function createIncident(payload) {
      state.loading = true; renderToolbar();
      try {
        const res = await fetch('/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data?.incident?.id) {
          await sleep(1200);
          await fetchIncidents();
          selectIncident(data.incident.id);
        }
      } catch (e) {
        console.error('Failed to create incident', e);
      } finally {
        state.loading = false; renderToolbar();
      }
    }

    function selectIncident(id) {
      state.selected = (state.incidents || []).find(x => x.id === id) || null;
      renderDetails();
    }

    function sevPill(severity) {
      const sev = String(severity || 'medium').toLowerCase();
      if (sev === 'critical' || sev === 'high') return '<span class="pill crit">' + sev + '</span>';
      if (sev === 'low') return '<span class="pill ok">' + sev + '</span>';
      return '<span class="pill warn">' + sev + '</span>';
    }

    function statusPill(status) {
      const st = String(status || 'new').toLowerCase();
      if (st === 'resolved') return '<span class="pill ok">' + st + '</span>';
      if (st === 'failed') return '<span class="pill crit">' + st + '</span>';
      return '<span class="pill">' + st + '</span>';
    }

    function renderList() {
      const list = el('#inc-list');
      if (!list) return;
      const items = (state.incidents || []).map(inc => {
        return '<div class="inc" role="button" onclick="selectIncident(\'' + inc.id + '\')">\n'
          + '  <div>\n'
          + '    <div class="title">' + (inc.title || 'Untitled Incident') + '</div>\n'
          + '    <div class="meta">\n'
          + '      ' + sevPill(inc.severity) + '\n'
          + '      ' + statusPill(inc.status) + '\n'
          + '      <span class="muted">Created ' + fmtTime(inc.created_at) + '</span>\n'
          + '    </div>\n'
          + '  </div>\n'
          + '  <div class="muted">›</div>\n'
          + '</div>';
      }).join('');
      list.innerHTML = items || '<div class="muted">No incidents yet</div>';
    }

    function renderToolbar() {
      el('#toolbar').querySelectorAll('button').forEach(b => b.disabled = !!state.loading);
      el('#create-btn').disabled = !!state.loading;
      el('#create-btn').innerText = state.loading ? 'Creating…' : 'Create Incident';
    }

    function renderDetails() {
      const d = el('#inc-details');
      if (!d) return;
      if (!state.selected) { d.innerHTML = '<div class="muted">Select an incident to view details</div>'; return; }
      const inc = state.selected;
      const analysis = parseMaybeJson(inc.rca_analysis);
      const actions = parseMaybeJson(inc.actions_taken);
      d.innerHTML = ''
        + '<div class="split">\n'
        + '  <div>\n'
        + '    <div class="muted">Incident</div>\n'
        + '    <div class="details">' + (JSON.stringify(inc, null, 2)) + '</div>\n'
        + '  </div>\n'
        + '  <div>\n'
        + '    <div class="muted">RCA Analysis</div>\n'
        + '    <div class="details">' + (analysis ? JSON.stringify(analysis, null, 2) : 'Not available yet') + '</div>\n'
        + '  </div>\n'
        + '</div>\n'
        + '<div style="height: 10px"></div>\n'
        + '<div>\n'
        + '  <div class="muted">Actions Taken</div>\n'
        + '  <div class="details">' + (actions ? JSON.stringify(actions, null, 2) : 'None recorded yet') + '</div>\n'
        + '</div>\n';
    }

    async function init() {
      await fetchIncidents();
      renderToolbar();
      renderDetails();
      setInterval(fetchIncidents, 7000);
    }

    window.addEventListener('DOMContentLoaded', init);
  </script>
</head>
<body>
  <header>
    <div class="brand"><span class="dot"></span> Incident Commander</div>
  </header>
  <div class="container">
    <section class="card">
      <h2>Triggered Incidents</h2>
      <div class="content">
        <div id="inc-list" class="list"></div>
      </div>
    </section>
    <section class="card">
      <h2>Demo: Trigger Sample Incidents</h2>
      <div class="content">
        <div id="toolbar" class="grid" style="margin-bottom: 10px;">
          <button class="btn primary" onclick="createIncident({ title: 'User API Pod OOM Error', description: 'Excessive GC detected, high heap usage', severity: 'critical' })">Trigger OOM</button>
          <button class="btn danger" onclick="createIncident({ title: 'PostgreSQL Database Connection Lost', description: 'Primary database cluster is unreachable, connection timeouts', severity: 'critical' })">Trigger DB Outage</button>
          <button class="btn warn" onclick="createIncident({ title: 'Analytics Worker High CPU', description: 'CPU sustained > 95% for 10m', severity: 'medium' })">Trigger High CPU</button>
          <button class="btn" onclick="createIncident({ title: 'Mystery Service Issue', description: 'Unknown service behavior detected', severity: 'low' })">Trigger Unknown</button>
        </div>
        <div class="card" style="background: rgba(0,0,0,0.25); border-color: rgba(255,255,255,0.06);">
          <div class="content">
            <div class="row" style="margin-bottom: 10px; justify-content: space-between; align-items: center;">
              <div class="muted">Custom Incident</div>
            </div>
            <div class="grid">
              <div class="field"><label class="muted">Title</label><input id="f-title" placeholder="e.g. Checkout service 5xx spike" /></div>
              <div class="field"><label class="muted">Severity</label>
                <select id="f-sev">
                  <option>low</option>
                  <option selected>medium</option>
                  <option>high</option>
                  <option>critical</option>
                </select>
              </div>
            </div>
            <div class="field" style="margin-top: 8px"><label class="muted">Description</label><textarea id="f-desc" placeholder="Describe the symptoms, e.g. error rates, latencies, events"></textarea></div>
            <div style="height: 10px"></div>
            <button id="create-btn" class="btn ok" onclick="createIncident({ title: el('#f-title').value, description: el('#f-desc').value, severity: el('#f-sev').value })">Create Incident</button>
          </div>
        </div>
        <div style="height: 12px"></div>
        <div id="inc-details"></div>
      </div>
      <div class="footer">Powered by Agentic Runbooks • Live demo</div>
    </section>
  </div>
</body>
</html>`;

    app.get('/', (c) => c.html(uiHtml));
    app.get('/ui', (c) => c.html(uiHtml));

    return app.fetch(request);
  }

  // Helper method to call tools via ServiceStub RPCs (no HTTP)
  private async callTool(toolName: string, args: any, env: Env, traceId: string): Promise<any> {
    env.logger.debug?.('Calling tool via tools-api', { traceId, toolName, args });
    switch (toolName) {
      case 'map-alert-to-runbook':
        return await env.TOOLS_API.mapAlertToRunbook(args.alertType, traceId);
      case 'get-logs':
        return await env.TOOLS_API.getLogs(args.serviceName, args.timeRange, traceId);
      case 'get-metrics':
        return await env.TOOLS_API.getMetrics(args.serviceName, traceId);
      case 'restart-pod':
        return await env.TOOLS_API.restartPod(args.podName, args.namespace, traceId);
      case 'send-notification':
        return await env.TOOLS_API.sendNotification(args.message, args.severity, args.channel, traceId);
      default:
        throw new Error(`Unknown tool endpoint: ${toolName}`);
    }
  }

  // Define available tools that GPT can call
  private getToolDefinitions() {
    return [
      {
        type: 'function',
        function: {
          name: 'map_alert_to_runbook',
          description: 'Map an alert type to the appropriate runbook',
          parameters: {
            type: 'object',
            properties: {
              alertType: {
                type: 'string',
                description: 'The type of alert (oom, database_outage, high_cpu, etc.)'
              }
            },
            required: ['alertType']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_logs',
          description: 'Retrieve logs for a specific service',
          parameters: {
            type: 'object',
            properties: {
              serviceName: {
                type: 'string',
                description: 'Name of the service to get logs for'
              },
              timeRange: {
                type: 'string',
                description: 'Time range for logs (e.g., 15m, 1h)'
              }
            },
            required: ['serviceName', 'timeRange']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_metrics',
          description: 'Retrieve metrics for a specific service',
          parameters: {
            type: 'object',
            properties: {
              serviceName: {
                type: 'string',
                description: 'Name of the service to get metrics for'
              }
            },
            required: ['serviceName']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'restart_pod',
          description: 'Restart a Kubernetes pod',
          parameters: {
            type: 'object',
            properties: {
              podName: {
                type: 'string',
                description: 'Name of the pod to restart'
              },
              namespace: {
                type: 'string',
                description: 'Kubernetes namespace'
              }
            },
            required: ['podName', 'namespace']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_notification',
          description: 'Send a notification to the appropriate channels',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Notification message'
              },
              severity: {
                type: 'string',
                description: 'Severity level (low, medium, high, critical)'
              },
              channel: {
                type: 'string',
                description: 'Notification channel (email, slack, etc.)'
              }
            },
            required: ['message', 'severity', 'channel']
          }
        }
      }
    ];
  }

  // Execute tool calls requested by GPT
  private async executeTool(toolName: string, args: any, env: Env, traceId: string): Promise<any> {
    env.logger.debug?.('Executing tool call', { traceId, toolName, args });

    // Map function names to tool endpoints
    const toolMapping: Record<string, string> = {
      'map_alert_to_runbook': 'map-alert-to-runbook',
      'get_logs': 'get-logs',
      'get_metrics': 'get-metrics',
      'restart_pod': 'restart-pod',
      'send_notification': 'send-notification'
    };

    const endpoint = toolMapping[toolName];
    if (!endpoint) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return await this.callTool(endpoint, args, env, traceId);
  }

  // Pretty logging helpers to make hackathon demo shine
  private formatPrettyBlock(title: string, data: any, traceId?: string): string {
    const timestamp = new Date().toISOString();
    const header = `╔══ ${title} ═════════════════════════════════════════════════════════════`;
    const meta = `║ traceId: ${traceId || 'n/a'}  •  at: ${timestamp}`;
    const separator = `╟────────────────────────────────────────────────────────────────────`;
    const bodyRaw = data == null
      ? 'No data'
      : (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    const body = bodyRaw.split('\n').map(line => `║ ${line}`).join('\n');
    const footer = `╚════════════════════════════════════════════════════════════════════`;
    return `\n${header}\n${meta}\n${separator}\n${body}\n${footer}`;
  }

  private pretty(title: string, data: any, traceId?: string) {
    const block = this.formatPrettyBlock(title, data, traceId);
    this.env.logger.debug?.(block, { traceId, title });
  }

  private prettyInfo(title: string, data: any, traceId?: string) {
    const block = this.formatPrettyBlock(title, data, traceId);
    this.env.logger.info(block, { traceId, title });
  }

  // GPT-powered incident analysis with agentic tool calling
  private async analyzeIncident(env: Env, incident: any, traceId: string) {
    const analysisStart = Date.now();
    env.logger.info('Starting agentic GPT incident analysis', {
      traceId,
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity
    });

    try {
      // Update status to analyzing
      await env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?')
        .bind('analyzing', new Date().toISOString(), incident.id)
        .run();

      const actionsTaken: string[] = [];

      // Prompt-embedded tools approach: provide tools in OpenAI format and enforce strict JSON responses
      const toolDefinitions = this.getToolDefinitions();
      const toolsForPrompt = toolDefinitions.map(t => ({ type: 'function', function: t.function }));

      const baseSystemMessage = `You are an expert SRE (Site Reliability Engineer) responsible for incident response and resolution.
Your task is to analyze incidents and take appropriate action following SRE best practices.

INCIDENT DETAILS:
- Title: ${incident.title}
- Description: ${incident.description || 'No description provided'}
- Severity: ${incident.severity}

WORKFLOW:
1. Identify the incident type and get the appropriate runbook using map_alert_to_runbook
2. Follow runbook procedures to investigate (use get_logs and get_metrics)
3. Based on runbook guidance, decide on appropriate action
4. If autonomous actions are allowed by the runbook, you may restart pods using restart_pod
5. Always send notifications about actions taken or escalation needs using send_notification
6. Provide final analysis and reasoning

You can simulate calling tools by returning a structured JSON plan of tool calls.
TOOLS (OpenAI tools schema):
${JSON.stringify({ tools: toolsForPrompt }, null, 2)}

RESPONSE REQUIREMENTS (STRICT):
- Always return ONLY a single JSON object, no prose, no markdown.
- JSON shape:
{
  "tool_calls": [
    { "name": "<tool_name>", "arguments": { /* args per schema */ } }
  ],
  "final": null
}
- When you have enough information to finish, return:
{
  "tool_calls": [],
  "final": {
    "analysis": "<your analysis>",
    "actions_taken": ["<summary of actions>"]
  }
}
- Ensure arguments strictly match the given tool parameter schemas.
- If prior tool results are provided, use them to decide next tool calls or provide final.

ITERATION POLICY:
- You have a hard cap of 5 iterations. Prefer to finalize as soon as sufficient information is available.
- If you anticipate needing more than 5 iterations, provide your best-effort final at or before the cap.

Begin by mapping this incident to the appropriate runbook using map_alert_to_runbook.`;

      const userMessage = `Please analyze and respond to this incident: "${incident.title}". Return ONLY JSON as specified above.`;

      // Execute the agentic workflow
      let currentUserMessage = userMessage;

      const maxIterations = 5;
      let iteration = 0;
      let toolCallsExecuted = false;

      while (iteration < maxIterations) {
        iteration++;
        env.logger.info('Agentic analysis iteration', { traceId, iteration });

        const currentSystemMessage = `${baseSystemMessage}\n\nITERATION CONTEXT:\n- iteration: ${iteration} of ${maxIterations}\n- remaining: ${maxIterations - iteration}\n- If sufficient information is available, return final now.`;

        env.logger.info('Sending request to AI with prompt-embedded tools', {
          traceId,
          toolCount: toolsForPrompt.length,
          toolNames: toolsForPrompt.map(t => (t as any).function.name),
          toolsSchema: toolsForPrompt,
          systemMessage: currentSystemMessage,
          userMessage: currentUserMessage
        });

        const response = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            { role: 'system' as const, content: currentSystemMessage },
            { role: 'user' as const, content: currentUserMessage }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4000,
          temperature: 0.2
        });

        const message = response.choices?.[0]?.message;
        if (!message) {
          throw new Error('No response from AI model');
        }

        // Log full raw assistant content for debugging
        env.logger.info('AI raw response content', {
          traceId,
          content: message.content
        });

        // Parse assistant JSON content and decide next step
        let parsed: any = null;
        try {
          parsed = JSON.parse(message.content || '{}');
        } catch (e: any) {
          // Try to extract JSON substring as fallback
          const match = (message.content || '').match(/\{[\s\S]*\}/);
          if (match) {
            try { parsed = JSON.parse(match[0]); } catch {}
          }
        }

        const messageContentLength = (message.content || '').length;
        const toolCalls = parsed?.tool_calls as Array<{ name: string; arguments: any }> | undefined;
        const toolCallCount = Array.isArray(toolCalls) ? toolCalls.length : 0;
        const hasFinal = parsed && typeof parsed === 'object' && parsed.final != null;

        env.logger.info('AI JSON parsed', {
          traceId,
          ok: parsed != null,
          keys: parsed ? Object.keys(parsed).slice(0, 10) : [],
          contentLength: messageContentLength,
          toolCallCount,
          hasFinal,
        });

        // Log full parsed JSON for visibility
        env.logger.info('AI parsed JSON full', {
          traceId,
          parsed
        });

        // Pretty log the AI inference in a crisp block (INFO level)
        this.prettyInfo('AI Inference (parsed)', {
          iteration,
          tool_calls_count: toolCallCount,
          tool_calls: (toolCalls || []).map(tc => ({ name: tc.name, arguments: tc.arguments })),
          has_final: hasFinal,
          final: hasFinal ? parsed.final : undefined
        }, traceId);
        if (toolCalls && toolCalls.length > 0) {
          env.logger.info('Processing tool calls', { traceId, toolCallCount: toolCalls.length });

          toolCallsExecuted = true;
          let toolResults: Array<{ name: string; arguments: any; result?: any; error?: string }> = [];

          for (const toolCall of toolCalls) {
            try {
              const functionName = toolCall.name;
              const args = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments || {};

              // Pretty: Tool Call Requested
              this.pretty(`Tool Call: ${functionName}`, { arguments: args }, traceId);

              env.logger.info('Executing tool', { traceId, functionName, args });
              const toolResult = await this.executeTool(functionName, args, env, traceId);

              actionsTaken.push(`${functionName}: ${JSON.stringify(args)} -> ${JSON.stringify(toolResult)}`);
              toolResults.push({ name: functionName, arguments: args, result: toolResult });

              // Log full tool result
              env.logger.info('Tool result', { traceId, functionName, result: toolResult });

              // Pretty tool result block
              this.pretty(`Tool Result: ${functionName}`, { arguments: args, result: toolResult }, traceId);

            } catch (toolError: any) {
              const errName = toolCall?.name || 'unknown';
              env.logger.error('Tool execution failed', { traceId, toolCall: errName, error: toolError.message });
              actionsTaken.push(`${errName} FAILED: ${toolError.message}`);
              toolResults.push({ name: errName, arguments: toolCall?.arguments, error: toolError.message });
            }
          }

          // Provide tool results for next iteration, enforce JSON-only reply
          currentUserMessage = `Tool execution results provided below. Based on these, either return next tool_calls or final. Return ONLY JSON.
${JSON.stringify({ tool_results: toolResults }, null, 2)}`;

        } else {
          // No more tool calls, analysis is complete
          env.logger.info('Agentic analysis completed', { traceId, iterations: iteration });

          const finalAnalysis = {
            workflow_completed: true,
            actions_taken: actionsTaken,
            analysis_result: (parsed?.final?.analysis ?? message.content) || 'Analysis completed',
            ai_reasoning: parsed?.final?.analysis ?? message.content,
            timestamp: new Date().toISOString(),
            iterations: iteration,
            tool_calls_executed: toolCallsExecuted
          };

          // Update incident with analysis results
          await env.INCIDENTS_DB
            .prepare(`UPDATE incidents
                      SET status = ?, rca_analysis = ?, actions_taken = ?, updated_at = ?
                      WHERE id = ?`)
            .bind('resolved', JSON.stringify(finalAnalysis), JSON.stringify(actionsTaken),
                  new Date().toISOString(), incident.id)
            .run();

          env.logger.info('Incident analysis completed successfully', {
            traceId,
            incidentId: incident.id,
            actionCount: actionsTaken.length,
            totalDuration: Date.now() - analysisStart,
            iterations: iteration
          });

          // Pretty final outcome
          this.pretty('Incident Analysis Completed', finalAnalysis, traceId);

          return;
        }
      }

      // If we reach max iterations, consider it completed but log a warning
      env.logger.warn('Maximum iterations reached', { traceId, maxIterations });

      const finalAnalysis = {
        workflow_completed: true,
        actions_taken: actionsTaken,
        analysis_result: 'Analysis completed after maximum iterations',
        warning: 'Maximum iteration limit reached',
        timestamp: new Date().toISOString(),
        iterations: iteration
      };

      await env.INCIDENTS_DB
        .prepare(`UPDATE incidents
                  SET status = ?, rca_analysis = ?, actions_taken = ?, updated_at = ?
                  WHERE id = ?`)
        .bind('resolved', JSON.stringify(finalAnalysis), JSON.stringify(actionsTaken),
              new Date().toISOString(), incident.id)
        .run();

      // Pretty final outcome on max-iteration completion
      this.pretty('Incident Analysis Completed (max iterations)', finalAnalysis, traceId);

    } catch (error: any) {
      env.logger.error('Agentic incident analysis failed', {
        traceId,
        incidentId: incident.id,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - analysisStart
      });

      // Update incident status to failed
      await env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ?, rca_analysis = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), JSON.stringify({ error: error.message }), incident.id)
        .run();

      // Pretty failure block
      this.pretty('Incident Analysis Failed', { error: error.message, stack: error.stack }, traceId);
    }
  }
}