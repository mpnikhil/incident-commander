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

        this.env.logger.info('Incident created, starting GPT analysis', {
          traceId,
          incidentId: incident?.id,
          severity,
          duration: Date.now() - startTime
        });

        // Start GPT analysis workflow (non-blocking)
        this.analyzeIncident(this.env, incident!, traceId).catch(error => {
          this.env.logger.error('GPT analysis failed', { traceId, error: error.message });
        });

        return c.json({
          incident: incident,
          traceId,
          message: 'Incident created, analysis in progress'
        });

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

    return app.fetch(request);
  }

  // GPT-powered incident analysis with autonomous actions
  private async analyzeIncident(env: Env, incident: any, traceId: string) {
    const analysisStart = Date.now();
    env.logger.info('Starting GPT incident analysis', {
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

      // Call GPT for intelligent analysis and decision making
      const gptResponse = await env.AI.run('gpt-oss-120b', {
        model: 'gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: `You are an expert SRE agent. Analyze incidents and take autonomous actions when safe.

INCIDENT ANALYSIS RULES:
1. For OOM (Out of Memory) issues: AUTONOMOUS pod restart is safe
2. For Database outages: NOTIFICATION ONLY - no autonomous actions
3. Always provide structured JSON response with reasoning

TOOLS AVAILABLE:
- mapping-mcp: identify services and runbooks
- observability-mcp: gather logs/metrics
- remediation-mcp: restart pods, send notifications

OUTPUT FORMAT: JSON with fields:
{
  "incident_type": "oom" | "database_outage" | "other",
  "root_cause_analysis": "detailed analysis",
  "autonomous_action_safe": boolean,
  "recommended_action": "specific action to take",
  "reasoning": "why this action is recommended"
}`
          },
          {
            role: 'user',
            content: `Analyze this incident:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}

Perform root cause analysis and determine if autonomous action is safe.`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      const analysis = gptResponse.choices?.[0]?.message?.content || 'No analysis available';
      env.logger.info('GPT analysis completed', {
        traceId,
        incidentId: incident.id,
        duration: Date.now() - analysisStart,
        analysisLength: analysis.length
      });

      // Parse GPT response and take actions
      let actionsTaken: string[] = [];
      let parsedAnalysis: any = {};

      try {
        // Try to parse JSON from GPT response
        const jsonMatch = analysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        env.logger.warn('Failed to parse GPT JSON, using text analysis', { traceId });
        parsedAnalysis = { root_cause_analysis: analysis };
      }

      // Determine if autonomous action should be taken
      const isOOM = incident.title.toLowerCase().includes('oom') ||
                    incident.title.toLowerCase().includes('memory') ||
                    incident.description?.toLowerCase().includes('out of memory');

      const isDBOutage = incident.title.toLowerCase().includes('database') ||
                         incident.title.toLowerCase().includes('db');

      if (isOOM && parsedAnalysis.autonomous_action_safe !== false) {
        env.logger.info('Taking autonomous action for OOM incident', { traceId, incidentId: incident.id });
        actionsTaken.push('Autonomous pod restart initiated');

        // Simulate notification of successful action
        actionsTaken.push('Notification sent: Pod restarted successfully');
      } else if (isDBOutage) {
        env.logger.info('Database incident detected - notification only', { traceId, incidentId: incident.id });
        actionsTaken.push('Notification sent: Database outage requires manual intervention');
      } else {
        env.logger.info('General incident - notification sent', { traceId, incidentId: incident.id });
        actionsTaken.push('Notification sent: Incident requires investigation');
      }

      // Update incident with analysis and actions
      await env.INCIDENTS_DB
        .prepare(`UPDATE incidents
                  SET status = ?, rca_analysis = ?, actions_taken = ?, updated_at = ?
                  WHERE id = ?`)
        .bind('resolved', JSON.stringify(parsedAnalysis), JSON.stringify(actionsTaken),
              new Date().toISOString(), incident.id)
        .run();

      env.logger.info('Incident analysis completed successfully', {
        traceId,
        incidentId: incident.id,
        actionsTaken: actionsTaken.length,
        totalDuration: Date.now() - analysisStart
      });

    } catch (error: any) {
      env.logger.error('Incident analysis failed', {
        traceId,
        incidentId: incident.id,
        error: error.message,
        duration: Date.now() - analysisStart
      });

      // Update incident status to failed
      await env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ?, rca_analysis = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), JSON.stringify({ error: error.message }), incident.id)
        .run();
    }
  }
}