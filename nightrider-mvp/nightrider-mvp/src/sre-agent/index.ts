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

    // POST /incidents - Create new incident and trigger AGENTIC GPT analysis
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
          .prepare('INSERT INTO incidents (id, status, title, description, severity, trace_id, created_at, updated_at, rca_analysis, actions_taken, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(
            incident.id,
            incident.status,
            incident.title,
            incident.description,
            incident.severity,
            incident.trace_id,
            incident.created_at,
            incident.updated_at,
            incident.rca_analysis,
            incident.actions_taken,
            incident.metadata
          )
          .run();

        this.env.logger.info('Incident created successfully', { 
          traceId, 
          incidentId: incident.id,
          title: incident.title 
        });

        // Start AGENTIC analysis in background
        this.performAgenticAnalysis(incident, traceId).catch(error => {
          this.env.logger.error('Agentic analysis failed', { 
            traceId, 
            incidentId: incident.id, 
            error: String(error) 
          });
        });

        return c.json({
          incident,
          traceId,
          message: 'Incident created and agentic analysis started'
        });

      } catch (error) {
        this.env.logger.error('Failed to create incident', { traceId, error: String(error) });
        return c.json({ error: 'Failed to create incident' }, 500);
      }
    });

    // GET /incidents/:id - Get specific incident
    app.get('/incidents/:id', async (c) => {
      const incidentId = c.req.param('id');
      this.env.logger.info('Fetching incident', { traceId, incidentId });

      try {
        const result = await this.env.INCIDENTS_DB
          .prepare('SELECT * FROM incidents WHERE id = ?')
          .bind(incidentId)
          .first();

        if (!result) {
          return c.json({ error: 'Incident not found' }, 404);
        }

        return c.json({ incident: result, traceId });
      } catch (error) {
        this.env.logger.error('Failed to fetch incident', { traceId, error: String(error) });
        return c.json({ error: 'Failed to fetch incident' }, 500);
      }
    });

    // GET /incidents - List all incidents
    app.get('/incidents', async (c) => {
      this.env.logger.info('Listing all incidents', { traceId });

      try {
        const results = await this.env.INCIDENTS_DB
          .prepare('SELECT * FROM incidents ORDER BY created_at DESC')
          .all();

        return c.json({ 
          incidents: results.results || [], 
          count: results.results?.length || 0,
          traceId 
        });
      } catch (error) {
        this.env.logger.error('Failed to list incidents', { traceId, error: String(error) });
        return c.json({ error: 'Failed to list incidents' }, 500);
      }
    });

    return app.fetch(request);
  }

  // AGENTIC ANALYSIS - The core autonomous agent logic
  private async performAgenticAnalysis(incident: any, traceId: string) {
    const analysisStart = Date.now();
    this.env.logger.info('🤖 Starting AGENTIC incident analysis', { traceId, incidentId: incident.id });

    try {
      // Update incident status to analyzing
      await this.env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?')
        .bind('analyzing', new Date().toISOString(), incident.id)
        .run();

      // Initialize MCP client
      const mcpClient = new McpClientManager(this.env.logger, this.env);

      // AGENTIC PHASE 1: Tool Discovery and Planning
      this.env.logger.info('🔍 Phase 1: Tool Discovery and Planning', { traceId });
      
      const availableTools = mcpClient.getAvailableTools();
      const toolsDescription = this.formatToolsForAI(availableTools);
      const alertType = this.determineAlertType(incident.title, incident.description);
      
      // AI Planning - decide which tools to use (TRULY AUTONOMOUS)
      const planningPrompt = `You are an autonomous SRE agent. Analyze this incident and create a plan.

INCIDENT:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}
Alert Type: ${alertType}

AVAILABLE TOOLS:
${toolsDescription}

SRE GUIDELINES & SAFETY RULES:
- CRITICAL SERVICES: postgres-primary, user-api (NO restart-pod, NO rollback-deployment, NO scale-service)
- DATABASE SERVICES: postgres-primary, mysql-primary, mongodb-primary (Manual intervention only)
- HIGH RISK ACTIONS: rollback-deployment, enable-circuit-breaker, restart-pod (Requires approval for critical services)
- SAFE AUTONOMOUS ACTIONS: send-notification, scale-service, get-logs, get-metrics (Low risk)
- SERVICE TYPES: user-api (frontend), postgres-primary (database), analytics-worker (background), redis-cache (cache), nginx-proxy (load-balancer)

TOOL SELECTION STRATEGY:
1. For OOM issues: Use get-logs, get-metrics, restart-pod (if not critical service)
2. For database issues: Use get-logs, send-notification (NO autonomous actions)
3. For high CPU: Use get-metrics, analyze-trends, scale-service (if not database)
4. For network issues: Use get-logs, check-alerts, send-notification
5. Always map alert to service first to understand context
6. Check service criticality before taking any actions
7. Use runbooks for complex incidents

You have complete freedom to choose which tools to use. Create a JSON plan with:

{
  "analysis_phase": [
    // Choose ANY tools from the available tools that you think are needed for analysis
    // You can use 0, 1, or many tools - it's your decision
    // Examples: map-alert-to-service, get-logs, get-metrics, get-dashboard-data, get-runbook
  ],
  "action_phase": [
    // Choose ANY tools from the available tools that you think are needed for actions
    // You can use 0, 1, or many tools - it's your decision
    // Examples: restart-pod, send-notification, scale-service
  ],
  "reasoning": "Explain your overall strategy and why you chose these specific tools"
}

IMPORTANT RULES:
1. You have COMPLETE FREEDOM to choose any combination of tools
2. You can choose NO tools if you think none are needed
3. You can choose tools in any order
4. You can choose tools from any service
5. Only choose tools that are actually useful for this specific incident
6. Think strategically about what information you need before taking actions
7. ALWAYS consider service criticality and safety rules
8. For database incidents, prefer notifications over autonomous actions
9. For critical services, be extra cautious with actions

Be creative and strategic in your tool selection while following safety guidelines!`;

      const planningResponse = await this.callAIWithRetry([
        { role: 'system', content: 'You are an expert SRE agent that plans incident response strategies.' },
        { role: 'user', content: planningPrompt }
      ], 600, 0.3);

      const plan = this.parseAIResponse(planningResponse);
      this.env.logger.info('AI planning completed', { traceId, plan });

      // AGENTIC PHASE 2: Execute Analysis Phase
      this.env.logger.info('🔍 Phase 2: Executing Analysis Phase', { traceId });
      const analysisResults = await this.executeAnalysisPhase(plan.analysis_phase || [], mcpClient, traceId, incident);
      
      // AGENTIC PHASE 3: Execute Action Phase
      this.env.logger.info('⚡ Phase 3: Executing Action Phase', { traceId });
      const actionResults = await this.executeActionPhase(plan.action_phase || [], mcpClient, traceId, incident, analysisResults);

      // AGENTIC PHASE 4: Final Analysis and Decision
      this.env.logger.info('🧠 Phase 4: Final Analysis and Decision', { traceId });
      const finalAnalysis = await this.performFinalAnalysis(incident, analysisResults, actionResults, traceId);

      // Update incident with results
      await this.env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, rca_analysis = ?, actions_taken = ?, updated_at = ? WHERE id = ?')
        .bind(
          'resolved',
          JSON.stringify(finalAnalysis),
          JSON.stringify(actionResults.actionsTaken || []),
          new Date().toISOString(),
          incident.id
        )
        .run();

      this.env.logger.info('🤖 Agentic analysis completed', {
        traceId,
        incidentId: incident.id,
        duration: Date.now() - analysisStart,
        actionsTaken: actionResults.actionsTaken?.length || 0
      });

    } catch (error) {
      this.env.logger.error('Agentic analysis failed', { traceId, error: String(error) });
      
      // Update incident status to failed
      await this.env.INCIDENTS_DB
        .prepare('UPDATE incidents SET status = ?, rca_analysis = ?, updated_at = ? WHERE id = ?')
        .bind(
          'failed',
          JSON.stringify({ error: String(error) }),
          new Date().toISOString(),
          incident.id
        )
        .run();
    }
  }

  // Execute the analysis phase tools
  private async executeAnalysisPhase(analysisTools: any[], mcpClient: McpClientManager, traceId: string, incident: any): Promise<any> {
    const results: any = {};
    
    for (const tool of analysisTools) {
      try {
        // Safety check for analysis tools
        const safetyCheck = this.checkToolSafety(tool, incident);
        if (!safetyCheck.safe) {
          this.env.logger.warn(`Skipping unsafe analysis tool: ${tool.service}.${tool.tool}`, { 
            traceId, 
            reason: safetyCheck.reason 
          });
          results[`${tool.service}_${tool.tool}`] = { 
            error: `Safety check failed: ${safetyCheck.reason}`,
            skipped: true
          };
          continue;
        }

        this.env.logger.info(`Executing analysis tool: ${tool.service}.${tool.tool}`, { traceId, reason: tool.reason });
        
        const result = await mcpClient.executeTool(tool.service, tool.tool, tool.args);
        results[`${tool.service}_${tool.tool}`] = result;
        
        this.env.logger.info(`Analysis tool completed: ${tool.service}.${tool.tool}`, { traceId });
      } catch (error) {
        this.env.logger.warn(`Analysis tool failed: ${tool.service}.${tool.tool}`, { 
          traceId, 
          error: String(error),
          reason: tool.reason 
        });
        results[`${tool.service}_${tool.tool}`] = { error: String(error) };
      }
    }
    
    return results;
  }

  // Execute the action phase tools
  private async executeActionPhase(actionTools: any[], mcpClient: McpClientManager, traceId: string, incident: any, analysisResults: any): Promise<any> {
    const actionsTaken: string[] = [];
    const results: any = {};
    
    for (const tool of actionTools) {
      try {
        // Safety check for action tools (more strict than analysis)
        const safetyCheck = this.checkToolSafety(tool, incident);
        if (!safetyCheck.safe) {
          this.env.logger.warn(`Skipping unsafe action tool: ${tool.service}.${tool.tool}`, { 
            traceId, 
            reason: safetyCheck.reason 
          });
          results[`${tool.service}_${tool.tool}`] = { 
            error: `Safety check failed: ${safetyCheck.reason}`,
            skipped: true
          };
          actionsTaken.push(`${tool.tool} skipped: ${safetyCheck.reason}`);
          continue;
        }

        this.env.logger.info(`Executing action tool: ${tool.service}.${tool.tool}`, { traceId, reason: tool.reason });
        
        // Update args with data from analysis phase
        const updatedArgs = this.updateArgsWithAnalysis(tool.args, analysisResults);
        
        const result = await mcpClient.executeTool(tool.service, tool.tool, updatedArgs);
        results[`${tool.service}_${tool.tool}`] = result;
        
        if (result.success) {
          actionsTaken.push(`${tool.tool}: ${result.message}`);
        } else {
          actionsTaken.push(`${tool.tool} failed: ${result.message}`);
        }
        
        this.env.logger.info(`Action tool completed: ${tool.service}.${tool.tool}`, { traceId, success: result.success });
      } catch (error) {
        this.env.logger.warn(`Action tool failed: ${tool.service}.${tool.tool}`, { 
          traceId, 
          error: String(error),
          reason: tool.reason 
        });
        actionsTaken.push(`${tool.tool} error: ${String(error)}`);
        results[`${tool.service}_${tool.tool}`] = { error: String(error) };
      }
    }
    
    return { actionsTaken, results };
  }

  // Update tool arguments with data from analysis phase
  private updateArgsWithAnalysis(args: any, analysisResults: any): any {
    const updatedArgs = { ...args };
    
    // If we have service mapping results, use them
    const mappingResult = analysisResults['mapping-mcp_map-alert-to-service'];
    if (mappingResult?.content?.[0]?.text) {
      try {
        const serviceInfo = JSON.parse(mappingResult.content[0].text);
        if (serviceInfo.serviceName) {
          updatedArgs.serviceName = serviceInfo.serviceName;
          updatedArgs.namespace = serviceInfo.namespace;
          updatedArgs.podName = serviceInfo.podName;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    return updatedArgs;
  }

  // Perform final analysis and decision making
  private async performFinalAnalysis(incident: any, analysisResults: any, actionResults: any, traceId: string): Promise<any> {
    const finalPrompt = `You are an expert SRE agent. Perform final analysis of this incident.

INCIDENT:
Title: ${incident.title}
Description: ${incident.description}
Severity: ${incident.severity}

ANALYSIS RESULTS:
${JSON.stringify(analysisResults, null, 2)}

ACTION RESULTS:
${JSON.stringify(actionResults, null, 2)}

SRE GUIDELINES & SAFETY RULES:
- CRITICAL SERVICES: postgres-primary, user-api (NO restart-pod, NO rollback-deployment, NO scale-service)
- DATABASE SERVICES: postgres-primary, mysql-primary, mongodb-primary (Manual intervention only)
- HIGH RISK ACTIONS: rollback-deployment, enable-circuit-breaker, restart-pod (Requires approval)
- SAFE AUTONOMOUS ACTIONS: send-notification, scale-service, get-logs, get-metrics

Provide a comprehensive analysis including:
1. Root cause analysis
2. Actions taken and their effectiveness
3. Safety compliance assessment
4. Recommendations for prevention
5. Overall incident resolution status

Return JSON with:
{
  "incident_type": "string",
  "root_cause_analysis": "detailed analysis",
  "autonomous_action_safe": true/false,
  "recommended_action": "What should be done next",
  "actions_effectiveness": "assessment of actions taken",
  "safety_compliance": "assessment of safety rules compliance",
  "recommendations": ["prevention recommendations"],
  "resolution_status": "resolved|partial|failed",
  "confidence_score": 0.0-1.0,
  "reasoning": "overall reasoning including safety considerations"
}`;

    const finalResponse = await this.callAIWithRetry([
      { role: 'system', content: 'You are an expert SRE agent performing final incident analysis.' },
      { role: 'user', content: finalPrompt }
    ], 800, 0.3);

    return this.parseAIResponse(finalResponse);
  }

  // Safety check for tool execution
  private checkToolSafety(tool: any, incident: any): { safe: boolean; reason?: string } {
    const criticalServices = ['postgres-primary', 'user-api'];
    const databaseServices = ['postgres-primary', 'mysql-primary', 'mongodb-primary'];
    const highRiskActions = ['restart-pod', 'rollback-deployment', 'enable-circuit-breaker'];
    
    // Check if tool is high risk
    if (highRiskActions.includes(tool.tool)) {
      // Check if incident involves critical services
      const incidentText = `${incident.title} ${incident.description}`.toLowerCase();
      const involvesCriticalService = criticalServices.some(service => 
        incidentText.includes(service) || incidentText.includes('database')
      );
      
      if (involvesCriticalService) {
        return { 
          safe: false, 
          reason: `High risk action '${tool.tool}' not allowed for critical services` 
        };
      }
    }
    
    // Check for database-specific restrictions
    if (tool.tool === 'restart-pod' || tool.tool === 'scale-service') {
      const incidentText = `${incident.title} ${incident.description}`.toLowerCase();
      const involvesDatabase = databaseServices.some(service => 
        incidentText.includes(service) || incidentText.includes('database')
      );
      
      if (involvesDatabase) {
        return { 
          safe: false, 
          reason: `Action '${tool.tool}' not allowed for database services` 
        };
      }
    }
    
    return { safe: true };
  }

  // Helper methods
  private formatToolsForAI(availableTools: Map<string, any[]>): string {
    let description = '';
    for (const [serviceName, tools] of availableTools) {
      description += `\n${serviceName}:\n`;
      for (const tool of tools) {
        description += `  - ${tool.name}: ${tool.description} (params: ${tool.parameters.join(', ')})\n`;
      }
    }
    return description;
  }

  private determineAlertType(title: string, description?: string): string {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('oom') || text.includes('out of memory') || text.includes('memory')) {
      return 'oom';
    } else if (text.includes('database') || text.includes('db') || text.includes('postgres')) {
      return 'database_outage';
    } else if (text.includes('cpu') || text.includes('high cpu')) {
      return 'high_cpu';
    } else if (text.includes('network') || text.includes('connection')) {
      return 'network_issue';
    } else {
      return 'general_incident';
    }
  }

  private parseAIResponse(response: any): any {
    const content = response.choices?.[0]?.message?.content || '{}';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return { error: 'Failed to parse AI response', content };
  }

  private async callAIWithRetry(messages: any[], maxTokens: number = 200, temperature: number = 0.3): Promise<any> {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const aiResponse = await this.env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages,
          max_tokens: maxTokens,
          temperature
        });
        return aiResponse;
      } catch (aiError) {
        retryCount++;
        const errorMessage = String(aiError);
        
        if (errorMessage.includes('Capacity temporarily exceeded') && retryCount < maxRetries) {
          this.env.logger.warn(`AI capacity exceeded, retrying ${retryCount}/${maxRetries}`, { 
            error: errorMessage,
            retryCount 
          });
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          continue;
        } else {
          this.env.logger.error('AI call failed after retries', { 
            error: errorMessage,
            retryCount 
          });
          throw aiError;
        }
      }
    }
  }
}
