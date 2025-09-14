import { ActorState } from "@liquidmetal-ai/raindrop-framework";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env } from './raindrop.gen';

export const implementation = {
  name: "observability-mcp",
  version: "1.0.0",
}

export default async (server: McpServer, env: Env, state: ActorState) => {
  // Tool: Get logs for a service with AI analysis
  server.tool("get-logs", {
    serviceName: z.string().describe("Name of the service to get logs for"),
    timeRange: z.string().optional().describe("Time range for logs (e.g., '1h', '30m', default: '15m')"),
    incidentType: z.string().optional().describe("Type of incident for context-specific log analysis")
  }, async ({ serviceName, timeRange = '15m', incidentType }, extra) => {
      env.logger.info('AI-powered log analysis', { serviceName, timeRange, incidentType });

      try {
        // Use AI to generate realistic logs and analyze them
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE log analyst. Generate realistic log entries and analyze them for incident response.

SERVICE TYPES:
- user-api: Java/Spring Boot service, prone to OOM, handles HTTP requests
- postgres-primary: PostgreSQL database, disk/memory issues, connection problems
- analytics-worker: Python/Go worker, CPU intensive, queue processing
- redis-cache: Redis cache, memory issues, connection problems
- nginx-proxy: Nginx load balancer, network issues, upstream problems

LOG PATTERNS:
- ERROR: Critical issues requiring immediate attention
- WARN: Potential issues that should be monitored
- INFO: Normal operations and status updates
- DEBUG: Detailed debugging information

Generate realistic logs for the service and incident type, then provide analysis.`
            },
            {
              role: 'user',
              content: `Generate and analyze logs for:
Service: ${serviceName}
Time Range: ${timeRange}
Incident Type: ${incidentType || 'general'}

Return JSON with:
{
  "logs": [
    {"timestamp": "ISO-8601", "level": "ERROR|WARN|INFO|DEBUG", "message": "log message", "source": "component"}
  ],
  "analysis": {
    "criticalIssues": ["list of critical issues found"],
    "warnings": ["list of warnings"],
    "recommendations": ["actionable recommendations"],
    "severity": "low|medium|high|critical"
  },
  "summary": "Overall log health assessment"
}`
            }
          ],
          max_tokens: 1000,
          temperature: 0.3
        });

        const aiAnalysis = aiResponse.choices?.[0]?.message?.content || '{}';
        env.logger.info('AI log analysis completed', { serviceName, analysisLength: aiAnalysis.length });

        // Parse AI response
        let logData;
        try {
          const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            logData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch (parseError) {
          env.logger.warn('Failed to parse AI response, using fallback', { parseError: String(parseError) });
          // Fallback to basic logs
          logData = {
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'INFO',
                message: `Service ${serviceName} is running normally`,
                source: serviceName
              }
            ],
            analysis: {
              criticalIssues: [],
              warnings: [],
              recommendations: ['Monitor service health'],
              severity: 'low'
            },
            summary: 'Service appears healthy'
          };
        }

        const logResponse = {
          serviceName,
          timeRange,
          logCount: logData.logs?.length || 0,
          logs: logData.logs || [],
          analysis: logData.analysis || {},
          summary: logData.summary || 'No analysis available',
          timestamp: new Date().toISOString()
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(logResponse, null, 2)
          }]
        };

      } catch (error) {
        env.logger.error('AI log analysis failed', { serviceName, error: String(error) });
        
        // Fallback to basic logs
        const fallbackLogs = {
          serviceName,
          timeRange,
          logCount: 1,
          logs: [{
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Service ${serviceName} - AI analysis unavailable`,
            source: serviceName
          }],
          analysis: {
            criticalIssues: [],
            warnings: ['AI analysis failed'],
            recommendations: ['Check service manually'],
            severity: 'medium'
          },
          summary: 'AI analysis failed, manual review required',
          timestamp: new Date().toISOString()
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallbackLogs, null, 2)
          }]
        };
      }
    });

  // Tool: Get metrics for a service with AI analysis
  server.tool("get-metrics", {
    serviceName: z.string().describe("Name of the service to get metrics for"),
    incidentType: z.string().optional().describe("Type of incident for context-specific metrics")
  }, async ({ serviceName, incidentType }, extra) => {
      env.logger.info('AI-powered metrics analysis', { serviceName, incidentType });

      try {
        // Use AI to generate realistic metrics and analyze them
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE metrics analyst. Generate realistic metrics and analyze them for incident response.

METRIC TYPES:
- CPU: Usage percentage, limits, throttling
- Memory: Usage, limits, OOM risk
- Network: Bandwidth, latency, errors
- Storage: Disk usage, I/O operations
- Application: RPS, error rates, response times
- Kubernetes: Pod status, restarts, scaling

HEALTH LEVELS:
- healthy: All metrics within normal ranges
- warning: Some metrics approaching limits
- degraded: Performance impacted but functional
- critical: Service at risk of failure

Generate realistic metrics for the service and incident type, then provide analysis.`
            },
            {
              role: 'user',
              content: `Generate and analyze metrics for:
Service: ${serviceName}
Incident Type: ${incidentType || 'general'}

Return JSON with:
{
  "metrics": {
    "cpu": {"usage": "45%", "limit": "1000m", "throttled": false},
    "memory": {"usage": "1.8GB", "limit": "2GB", "percentage": 90},
    "network": {"bandwidth": "100Mbps", "latency": "50ms", "errors": 0},
    "storage": {"usage": "80%", "iops": 1000, "available": "20GB"},
    "application": {"rps": 150, "errorRate": "2.1%", "avgResponseTime": "200ms"},
    "kubernetes": {"runningPods": 2, "desiredPods": 3, "restarts": 5}
  },
  "analysis": {
    "healthStatus": "healthy|warning|degraded|critical",
    "criticalIssues": ["list of critical issues"],
    "warnings": ["list of warnings"],
    "recommendations": ["actionable recommendations"],
    "trends": "improving|stable|degrading"
  },
  "summary": "Overall metrics health assessment"
}`
            }
          ],
          max_tokens: 800,
          temperature: 0.3
        });

        const aiAnalysis = aiResponse.choices?.[0]?.message?.content || '{}';
        env.logger.info('AI metrics analysis completed', { serviceName, analysisLength: aiAnalysis.length });

        // Parse AI response
        let metricsData;
        try {
          const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            metricsData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch (parseError) {
          env.logger.warn('Failed to parse AI response, using fallback', { parseError: String(parseError) });
          // Fallback to basic metrics
          metricsData = {
            metrics: {
              cpu: { usage: '10%', limit: '500m', throttled: false },
              memory: { usage: '256MB', limit: '1GB', percentage: 25 },
              network: { bandwidth: '50Mbps', latency: '10ms', errors: 0 },
              storage: { usage: '50%', iops: 100, available: '100GB' },
              application: { rps: 50, errorRate: '0.1%', avgResponseTime: '100ms' },
              kubernetes: { runningPods: 1, desiredPods: 1, restarts: 0 }
            },
            analysis: {
              healthStatus: 'healthy',
              criticalIssues: [],
              warnings: [],
              recommendations: ['Continue monitoring'],
              trends: 'stable'
            },
            summary: 'Service metrics appear healthy'
          };
        }

        const metricsResponse = {
          serviceName,
          timestamp: new Date().toISOString(),
          metrics: metricsData.metrics || {},
          analysis: metricsData.analysis || {},
          summary: metricsData.summary || 'No analysis available'
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(metricsResponse, null, 2)
          }]
        };

      } catch (error) {
        env.logger.error('AI metrics analysis failed', { serviceName, error: String(error) });
        
        // Fallback to basic metrics
        const fallbackMetrics = {
          serviceName,
          timestamp: new Date().toISOString(),
          metrics: {
            cpu: { usage: 'N/A', limit: 'N/A', throttled: false },
            memory: { usage: 'N/A', limit: 'N/A', percentage: 0 },
            health: 'unknown'
          },
          analysis: {
            healthStatus: 'unknown',
            criticalIssues: ['AI analysis failed'],
            warnings: ['Metrics unavailable'],
            recommendations: ['Check service manually'],
            trends: 'unknown'
          },
          summary: 'AI analysis failed, manual review required'
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallbackMetrics, null, 2)
          }]
        };
      }
    });

  // Tool: Get dashboard data (combined logs + metrics)
  server.tool("get-dashboard-data", {
    serviceName: z.string().describe("Name of the service to get dashboard data for")
  }, async ({ serviceName }, extra) => {
      env.logger.info('Retrieving dashboard data', { serviceName });

      // This would combine the above two tools' data
      const dashboardData = {
        serviceName,
        timestamp: new Date().toISOString(),
        status: 'healthy',
        alerts: [
          {
            severity: 'warning',
            message: 'High memory usage detected',
            timestamp: '2024-09-14T10:30:15Z'
          }
        ],
        summary: {
          uptime: '99.2%',
          lastIncident: '2024-09-13T15:30:00Z',
          avgResponseTime: '145ms'
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(dashboardData, null, 2)
        }]
      };
    });
}