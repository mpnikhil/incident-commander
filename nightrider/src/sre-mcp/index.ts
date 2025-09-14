import { ActorState } from "@liquidmetal-ai/raindrop-framework";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env } from './raindrop.gen.js';
// Import MVC components
import * as Model from './model';
import * as Controller from './controller';

export const implementation = {
  name: "sre-mcp",
  version: "1.0.0",
}

/**
 * VIEW LAYER - SRE MCP Service (Protected)
 * Exposes comprehensive SRE data-gathering tools for agent use with full logging
 */
export default (server: McpServer, env: Env, state: ActorState) => {
  env.logger.info('Initializing SRE MCP service with comprehensive toolset');

  // Register get-logs tool
  server.registerTool("get-logs",
    {
      title: "Get System Logs",
      description: "Retrieve application and system logs for agent analysis",
      inputSchema: {
        service_name: z.string(),
        time_range: z.string(),
        log_level: z.string().optional(),
        search_terms: z.array(z.string()).optional(),
      },
    },
    async (params, extra) => {
      try {
        const logs = await Controller.handleGetLogs(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(logs, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('get-logs tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error retrieving logs: ${errorMessage}`
          }]
        };
      }
    });

  // Register get-metrics tool
  server.registerTool("get-metrics",
    {
      title: "Get System Metrics",
      description: "Retrieve system performance metrics for analysis",
      inputSchema: {
        metric_names: z.array(z.string()),
        time_range: z.string(),
        aggregation: z.string().optional(),
      },
    },
    async (params, extra) => {
      try {
        const metrics = await Controller.handleGetMetrics(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(metrics, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('get-metrics tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error retrieving metrics: ${errorMessage}`
          }]
        };
      }
    });

  // Register get-alerts tool
  server.registerTool("get-alerts",
    {
      title: "Get Active Alerts",
      description: "Retrieve current system alerts and their status",
      inputSchema: {
        severity_filter: z.string().optional(),
        status_filter: z.string().optional(),
        time_range: z.string().optional(),
      },
    },
    async (params, extra) => {
      try {
        const alerts = await Controller.handleGetAlerts(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(alerts, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('get-alerts tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error retrieving alerts: ${errorMessage}`
          }]
        };
      }
    });

  // Register get-system-status tool
  server.registerTool("get-system-status",
    {
      title: "Get System Status",
      description: "Check the health status of system components",
      inputSchema: {
        components: z.array(z.string()).optional(),
      },
    },
    async (params, extra) => {
      try {
        const status = await Controller.handleGetSystemStatus(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(status, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('get-system-status tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error retrieving system status: ${errorMessage}`
          }]
        };
      }
    });

  // Register search-runbooks tool
  server.registerTool("search-runbooks",
    {
      title: "Search Runbooks",
      description: "Search for relevant operational runbooks and procedures",
      inputSchema: {
        query: z.string(),
        category: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    async (params, extra) => {
      try {
        const runbooks = await Controller.handleSearchRunbooks(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(runbooks, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('search-runbooks tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error searching runbooks: ${errorMessage}`
          }]
        };
      }
    });

  // Register execute-remediation tool
  server.registerTool("execute-remediation",
    {
      title: "Execute Remediation",
      description: "Execute automated remediation actions for incidents",
      inputSchema: {
        action_type: z.string(),
        target: z.string(),
        parameters: z.record(z.any()).optional(),
      },
    },
    async (params, extra) => {
      try {
        const result = await Controller.handleExecuteRemediation(params, env);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.error('execute-remediation tool failed', { error: errorMessage });
        return {
          content: [{
            type: "text",
            text: `Error executing remediation: ${errorMessage}`
          }]
        };
      }
    });

  env.logger.info('SRE MCP service initialization completed', {
    tools_registered: 6,
    tools: ['get-logs', 'get-metrics', 'get-alerts', 'get-system-status', 'search-runbooks', 'execute-remediation']
  });
}
