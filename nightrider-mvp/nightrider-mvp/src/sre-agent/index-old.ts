import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { McpClientManager } from '../common/mcp-client';

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

    // Initialize MCP client manager
    const mcpClient = new McpClientManager(env.logger, env);

    try {
      // Update status to analyzing
      await env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?')
        .bind('analyzing', new Date().toISOString(), incident.id)
        .run();

      // Step 1: Use mapping-mcp to identify service and runbook
      let serviceInfo = null;
      let runbookContent = null;
      let alertType = 'general_incident';
      try {
        env.logger.info('Calling mapping-mcp to identify service', { traceId });
        
        // Determine alert type from incident title/description
        alertType = this.determineAlertType(incident.title, incident.description);
        serviceInfo = await mcpClient.mapAlertToService(alertType, traceId, incident.title, incident.description);
        
        if (serviceInfo?.serviceName) {
          runbookContent = await mcpClient.getRunbook(serviceInfo.serviceName, traceId, alertType);
        }
        
        env.logger.info('Service mapping completed', { 
          traceId, 
          serviceInfo, 
          runbookTitle: runbookContent?.title 
        });
        } catch (mappingError) {
          env.logger.warn('Mapping MCP failed, continuing with basic analysis', { 
            traceId, 
            error: String(mappingError) 
          });
      }

      // Step 2: Use observability-mcp to gather logs and metrics
      let logData = null;
      let metricData = null;
      if (serviceInfo?.serviceName) {
        try {
          env.logger.info('Calling observability-mcp to gather data', { traceId });
          
          logData = await mcpClient.getLogs(serviceInfo.serviceName, "1h", traceId, alertType);
          metricData = await mcpClient.getMetrics(serviceInfo.serviceName, traceId, alertType);
          
          env.logger.info('Observability data gathered', { 
            traceId, 
            logCount: logData?.logs?.length || 0,
            metricCount: metricData?.metrics?.length || 0
          });
        } catch (observabilityError) {
          env.logger.warn('Observability MCP failed, continuing without logs/metrics', { 
            traceId, 
            error: String(observabilityError) 
          });
        }
      }

      // Step 3: Call GPT for intelligent analysis with gathered data
      env.logger.info('About to call AI service with MCP data', { traceId, model: 'gpt-oss-120b' });
      
      const systemPrompt = `You are an expert SRE agent. Analyze incidents and take autonomous actions when safe.

INCIDENT ANALYSIS RULES:
1. For OOM (Out of Memory) issues: AUTONOMOUS pod restart is safe
2. For Database outages: NOTIFICATION ONLY - no autonomous actions
3. Always provide structured JSON response with reasoning

OUTPUT FORMAT: JSON with fields:
{
  "incident_type": "oom" | "database_outage" | "other",
  "root_cause_analysis": "detailed analysis",
  "autonomous_action_safe": boolean,
  "recommended_action": "specific action to take",
  "reasoning": "why this action is recommended",
  "confidence_score": 0.0-1.0
}`;

      const userPrompt = `Analyze this incident with the following context:

INCIDENT DETAILS:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}

SERVICE CONTEXT:
${serviceInfo ? `Service: ${serviceInfo.serviceName}
Namespace: ${serviceInfo.namespace}
Pod: ${serviceInfo.podName}
Runbook: ${runbookContent?.title || 'N/A'}` : 'No service mapping available'}

OBSERVABILITY DATA:
${logData ? `Recent Logs (${logData.logs?.length || 0} entries):
${logData.logs?.slice(0, 5).map(log => `[${log.timestamp}] ${log.level}: ${log.message}`).join('\n') || 'No logs available'}` : 'No log data available'}

${metricData ? `Current Metrics (${metricData.metrics?.length || 0} entries):
${metricData.metrics?.slice(0, 3).map(metric => `${metric.name}: ${metric.value} ${metric.unit}`).join('\n') || 'No metrics available'}
Health Status: ${metricData.healthStatus || 'Unknown'}` : 'No metric data available'}

Perform root cause analysis and determine if autonomous action is safe.`;

      // Retry logic for AI capacity issues
      let gptResponse;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          gptResponse = await env.AI.run('gpt-oss-120b', {
            model: 'gpt-oss-120b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 800,
            temperature: 0.3
          });
          break; // Success, exit retry loop
        } catch (aiError) {
          retryCount++;
          const errorMessage = String(aiError);
          
          if (errorMessage.includes('Capacity temporarily exceeded') && retryCount < maxRetries) {
            env.logger.warn(`AI capacity exceeded, retrying ${retryCount}/${maxRetries}`, { 
              traceId, 
              error: errorMessage,
              retryCount 
            });
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            continue;
          } else {
            // Either not a capacity error or max retries reached
            env.logger.error('AI analysis failed after retries', { 
              traceId, 
              error: errorMessage,
              retryCount 
            });
            throw aiError;
          }
        }
      }

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

      // Step 4: Execute autonomous actions based on analysis
      const isOOM = incident.title.toLowerCase().includes('oom') ||
                    incident.title.toLowerCase().includes('memory') ||
                    incident.description?.toLowerCase().includes('out of memory') ||
                    parsedAnalysis.incident_type === 'oom';

      const isDBOutage = incident.title.toLowerCase().includes('database') ||
                         incident.title.toLowerCase().includes('db') ||
                         parsedAnalysis.incident_type === 'database_outage';

      if (isOOM && parsedAnalysis.autonomous_action_safe !== false && serviceInfo?.podName) {
        env.logger.info('Taking autonomous action for OOM incident', { traceId, incidentId: incident.id });
        
        try {
          // Call remediation-mcp to restart pod
          const restartResult = await mcpClient.restartPod(
            serviceInfo.podName, 
            serviceInfo.namespace, 
            traceId,
            alertType,
            `OOM incident: ${incident.title}`
          );
          
          if (restartResult.success) {
            actionsTaken.push(`Autonomous pod restart: ${restartResult.message}`);
            env.logger.info('Pod restart successful', { traceId, restartResult });
          } else {
            actionsTaken.push(`Pod restart failed: ${restartResult.message}`);
            env.logger.warn('Pod restart failed', { traceId, restartResult });
          }
        } catch (restartError) {
          actionsTaken.push(`Pod restart error: ${String(restartError)}`);
          env.logger.error('Pod restart error', { traceId, error: String(restartError) });
        }

        // Send notification about the action
        try {
          const notificationResult = await mcpClient.sendNotification(
            `OOM incident resolved: Pod ${serviceInfo.podName} restarted autonomously`,
            'info',
            traceId,
            alertType,
            serviceInfo.serviceName
          );
          
          if (notificationResult.success) {
            actionsTaken.push(`Notification sent: ${notificationResult.messageId}`);
          }
        } catch (notificationError) {
          env.logger.warn('Notification failed', { traceId, error: String(notificationError) });
        }

      } else if (isDBOutage) {
        env.logger.info('Database incident detected - notification only', { traceId, incidentId: incident.id });
        
        try {
          const notificationResult = await mcpClient.sendNotification(
            `Database outage detected: ${incident.title} - Manual intervention required`,
            'critical',
            traceId,
            alertType,
            serviceInfo?.serviceName
          );
          
          if (notificationResult.success) {
            actionsTaken.push(`Notification sent: ${notificationResult.messageId}`);
          }
        } catch (notificationError) {
          env.logger.warn('Database notification failed', { traceId, error: String(notificationError) });
        }
        
        actionsTaken.push('Database incident - notification only (no autonomous actions)');
      } else {
        env.logger.info('General incident - notification sent', { traceId, incidentId: incident.id });
        
        try {
          const notificationResult = await mcpClient.sendNotification(
            `Incident requires investigation: ${incident.title}`,
            incident.severity,
            traceId,
            alertType,
            serviceInfo?.serviceName
          );
          
          if (notificationResult.success) {
            actionsTaken.push(`Notification sent: ${notificationResult.messageId}`);
          }
        } catch (notificationError) {
          env.logger.warn('General notification failed', { traceId, error: String(notificationError) });
        }
      }

      // Step 5: Update incident with comprehensive analysis and actions
      const finalAnalysis = {
        ...parsedAnalysis,
        serviceInfo,
        runbookContent,
        logData: logData ? { logCount: logData.logs?.length || 0, healthStatus: metricData?.healthStatus } : null,
        metricData: metricData ? { metricCount: metricData.metrics?.length || 0, healthStatus: metricData.healthStatus } : null,
        mcpDataGathered: {
          serviceMapping: !!serviceInfo,
          observabilityData: !!(logData || metricData),
          remediationActions: actionsTaken.length
        }
      };

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
        actionsTaken: actionsTaken.length,
        totalDuration: Date.now() - analysisStart,
        mcpIntegration: {
          serviceMapping: !!serviceInfo,
          observabilityData: !!(logData || metricData),
          remediationActions: actionsTaken.filter(a => a.includes('restart') || a.includes('Notification')).length
        }
      });

    } catch (error: any) {
      env.logger.error('Incident analysis failed', {
        traceId,
        incidentId: incident.id,
        error: error.message,
        stack: error.stack,
        errorName: error.name,
        duration: Date.now() - analysisStart
      });

      // Update incident status to failed
      await env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ?, rca_analysis = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), JSON.stringify({ error: error.message }), incident.id)
        .run();
    } finally {
      // Cleanup MCP connections
      try {
        await mcpClient.disconnect();
      } catch (disconnectError) {
        env.logger.warn('Failed to disconnect MCP clients', { traceId, error: String(disconnectError) });
      }
    }
  }

  // Helper method to determine alert type from incident details
  private determineAlertType(title: string, description?: string): string {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('oom') || text.includes('out of memory') || text.includes('memory')) {
      return 'oom';
    } else if (text.includes('database') || text.includes('db') || text.includes('postgres') || text.includes('mysql')) {
      return 'database_outage';
    } else if (text.includes('cpu') || text.includes('high cpu')) {
      return 'high_cpu';
    } else if (text.includes('disk') || text.includes('storage')) {
      return 'disk_full';
    } else if (text.includes('network') || text.includes('connectivity')) {
      return 'network_issue';
    } else {
      return 'general_incident';
    }
  }
}