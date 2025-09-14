import { ActorState } from "@liquidmetal-ai/raindrop-framework";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env } from './raindrop.gen';

export default async (server: McpServer, env: Env, state: ActorState) => {
  // Simple test tool first
  server.tool("test", async (extra) => {
    return {
      content: [{
        type: "text",
        text: "Mapping MCP service is working!"
      }]
    };
  });

  // Tool: Map alert type to service information using AI
  server.tool("map-alert-to-service", {
    alertType: z.string().describe("Type of alert (e.g., 'oom', 'database_outage', 'high_cpu')"),
    incidentTitle: z.string().optional().describe("Incident title for additional context"),
    incidentDescription: z.string().optional().describe("Incident description for additional context")
  }, async ({ alertType, incidentTitle, incidentDescription }, extra) => {
      env.logger.info('AI-powered service mapping', { alertType, incidentTitle });

      try {
        // Use AI to intelligently map alerts to services
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE service mapping agent. Based on alert types and incident details, map them to the most likely affected services.

SERVICE INVENTORY:
- user-api: Frontend API service, handles user requests, prone to OOM issues
- postgres-primary: Primary database, critical infrastructure
- analytics-worker: Background processing service, CPU intensive
- redis-cache: Caching layer, memory intensive
- nginx-proxy: Load balancer, network issues
- monitoring-stack: Observability services

MAPPING RULES:
- OOM/Memory issues → user-api, redis-cache (memory-intensive services)
- Database issues → postgres-primary
- High CPU → analytics-worker, monitoring-stack
- Network issues → nginx-proxy, user-api
- Cache issues → redis-cache

Return JSON with:
{
  "serviceName": "most-likely-service",
  "namespace": "production|database|cache",
  "podName": "realistic-pod-name",
  "runbookId": "service-specific-runbook",
  "confidence": 0.0-1.0,
  "reasoning": "why this service was selected"
}`
            },
            {
              role: 'user',
              content: `Map this alert to a service:
Alert Type: ${alertType}
Title: ${incidentTitle || 'N/A'}
Description: ${incidentDescription || 'N/A'}

Provide the most likely affected service with reasoning.`
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        });

        const aiAnalysis = aiResponse.choices?.[0]?.message?.content || '{}';
        env.logger.info('AI service mapping completed', { alertType, aiAnalysis });

        // Parse AI response
        let serviceInfo;
        try {
          const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            serviceInfo = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch (parseError) {
          env.logger.warn('Failed to parse AI response, using fallback', { parseError: String(parseError) });
          // Fallback to basic mapping
          serviceInfo = {
            serviceName: alertType.includes('database') ? 'postgres-primary' : 
                        alertType.includes('oom') ? 'user-api' : 'analytics-worker',
            namespace: 'production',
            podName: `${alertType}-service-pod-${Math.random().toString(36).substr(2, 9)}`,
            runbookId: `${alertType}-runbook`,
            confidence: 0.5,
            reasoning: 'Fallback mapping due to AI parsing error'
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(serviceInfo, null, 2)
          }]
        };

      } catch (error) {
        env.logger.error('AI service mapping failed', { alertType, error: String(error) });
        
        // Fallback to basic mapping
        const fallbackMapping = {
          serviceName: 'unknown-service',
          namespace: 'production',
          podName: 'unknown-pod',
          runbookId: 'general-incident-runbook',
          confidence: 0.1,
          reasoning: 'AI mapping failed, using fallback'
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallbackMapping, null, 2)
          }]
        };
      }
    });

  // Tool: Get runbook content for a service using AI
  server.tool("get-runbook", {
    serviceName: z.string().describe("Name of the service or runbook ID"),
    incidentType: z.string().optional().describe("Type of incident for context-specific runbook")
  }, async ({ serviceName, incidentType }, extra) => {
      env.logger.info('AI-powered runbook generation', { serviceName, incidentType });

      try {
        // Use AI to generate intelligent runbook content
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE runbook generator. Create detailed, actionable runbooks for incident response.

RUNBOOK STRUCTURE:
1. Service Overview
2. Common Issues & Symptoms
3. Diagnostic Steps
4. Recovery Procedures
5. Safety Guidelines
6. Escalation Procedures

SAFETY RULES:
- Pod restarts: SAFE for stateless services
- Database operations: REQUIRES MANUAL APPROVAL
- Memory/CPU scaling: REQUIRES APPROVAL
- Network changes: REQUIRES APPROVAL
- Configuration changes: REQUIRES APPROVAL

Return a well-formatted markdown runbook with specific commands and clear safety guidelines.`
            },
            {
              role: 'user',
              content: `Generate a runbook for:
Service: ${serviceName}
Incident Type: ${incidentType || 'general'}

Create a comprehensive runbook with specific commands, safety guidelines, and escalation procedures.`
            }
          ],
          max_tokens: 800,
          temperature: 0.2
        });

        const aiRunbook = aiResponse.choices?.[0]?.message?.content || 'No runbook generated';
        env.logger.info('AI runbook generation completed', { serviceName, runbookLength: aiRunbook.length });

        return {
          content: [{
            type: "text",
            text: aiRunbook
          }]
        };

      } catch (error) {
        env.logger.error('AI runbook generation failed', { serviceName, error: String(error) });
        
        // Fallback to basic runbook
        const fallbackRunbook = `# ${serviceName} Incident Runbook

## Service Overview
This is a fallback runbook for ${serviceName}.

## Common Issues
- Service unavailability
- Performance degradation
- Resource exhaustion

## Diagnostic Steps
1. Check service health: kubectl get pods -l app=${serviceName}
2. Review logs: kubectl logs -l app=${serviceName} --tail=100
3. Check resources: kubectl top pods -l app=${serviceName}

## Recovery Procedures
1. Restart pods if safe: kubectl delete pod -l app=${serviceName}
2. Scale if needed: kubectl scale deployment ${serviceName} --replicas=2
3. Monitor recovery: kubectl get pods -l app=${serviceName} -w

## Safety Guidelines
- Pod restarts: SAFE for stateless services
- Scaling: REQUIRES APPROVAL
- Configuration changes: REQUIRES APPROVAL

## Escalation
- Contact oncall team if issue persists
- Escalate to senior SRE for complex issues`;

        return {
          content: [{
            type: "text",
            text: fallbackRunbook
          }]
        };
      }
    });
}