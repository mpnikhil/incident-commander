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

  // Tool: Map alert type to service information
  server.tool("map-alert-to-service", {
    alertType: z.string().describe("Type of alert (e.g., 'oom', 'database_outage', 'high_cpu')")
  }, async ({ alertType }, extra) => {
      env.logger.info('Mapping alert to service', { alertType });

      // Simulated service mapping logic
      const serviceMapping: Record<string, any> = {
        'oom': {
          serviceName: 'user-api',
          namespace: 'production',
          podName: 'user-api-deployment-abc123',
          runbookId: 'oom-recovery-runbook'
        },
        'database_outage': {
          serviceName: 'postgres-primary',
          namespace: 'database',
          podName: 'postgres-primary-0',
          runbookId: 'database-outage-runbook'
        },
        'high_cpu': {
          serviceName: 'analytics-worker',
          namespace: 'production',
          podName: 'analytics-worker-xyz789',
          runbookId: 'high-cpu-runbook'
        }
      };

      const serviceInfo = serviceMapping[alertType.toLowerCase()] || {
        serviceName: 'unknown-service',
        namespace: 'production',
        podName: 'unknown-pod',
        runbookId: 'general-incident-runbook'
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(serviceInfo, null, 2)
        }]
      };
    });

  // Tool: Get runbook content for a service
  server.tool("get-runbook", {
    serviceName: z.string().describe("Name of the service or runbook ID")
  }, async ({ serviceName }, extra) => {
      env.logger.info('Retrieving runbook', { serviceName });

      // Simulated runbook content
      const runbooks: Record<string, string> = {
        'user-api': `
# User API Incident Runbook

## OOM Recovery Steps:
1. Check current memory usage: kubectl top pod user-api-deployment-*
2. Review memory limits in deployment.yaml
3. Restart affected pods: kubectl delete pod user-api-deployment-*
4. Monitor for 5 minutes post-restart
5. If issue persists, scale up replicas or increase memory limits

## Safe Actions:
- Pod restart: SAFE (automatic recovery)
- Memory limit increase: REQUIRES APPROVAL
        `,
        'postgres-primary': `
# Database Outage Runbook

## Database Recovery Steps:
1. Check database connection: pg_isready -h postgres-primary
2. Review database logs for errors
3. Check disk space and memory usage
4. **CRITICAL**: Database restarts require manual approval
5. Escalate to DBA team immediately

## Safe Actions:
- Connection checks: SAFE
- Log review: SAFE
- Database restart: REQUIRES MANUAL APPROVAL
        `,
        'general-incident-runbook': `
# General Incident Response

## Standard Steps:
1. Gather initial information about the incident
2. Check service health and dependencies
3. Review logs and metrics
4. Determine safe vs unsafe remediation actions
5. Take appropriate action or escalate

## Default Safe Actions:
- Log collection: SAFE
- Health checks: SAFE
- Notifications: SAFE
- Pod restarts for OOM: SAFE
- Database operations: REQUIRES APPROVAL
        `
      };

      const runbookContent = runbooks[serviceName] || runbooks['general-incident-runbook'];

      return {
        content: [{
          type: "text",
          text: runbookContent || 'No runbook content available'
        }]
      };
    });
}