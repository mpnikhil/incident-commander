import { ActorState } from "@liquidmetal-ai/raindrop-framework";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env } from './raindrop.gen';

export const implementation = {
  name: "remediation-mcp",
  version: "1.0.0",
}

export default async (server: McpServer, env: Env, state: ActorState) => {
  // Tool: Get comprehensive remediation guidelines and safety rules
  server.tool("get-remediation-guidelines", {
    includeSafetyRules: z.boolean().optional().describe("Include detailed safety rules and guidelines")
  }, async ({ includeSafetyRules = true }, extra) => {
    env.logger.info('Providing remediation guidelines', { includeSafetyRules });

    const guidelines = {
      safetyRules: {
        "critical_services": {
          services: ["postgres-primary", "user-api"],
          restrictions: ["NO restart-pod", "NO rollback-deployment", "NO scale-service"],
          allowedActions: ["send-notification", "create-incident-ticket"],
          escalationRequired: true
        },
        "database_services": {
          services: ["postgres-primary", "mysql-primary", "mongodb-primary"],
          restrictions: ["NO restart-pod", "NO rollback-deployment", "NO scale-service"],
          allowedActions: ["send-notification", "create-incident-ticket"],
          warning: "Database services require manual intervention"
        },
        "high_risk_actions": {
          actions: ["rollback-deployment", "enable-circuit-breaker", "restart-pod"],
          conditions: ["Requires approval for critical services", "Check dependencies first"],
          safetyChecks: ["Verify no data loss", "Check service dependencies", "Confirm rollback plan"]
        },
        "autonomous_safe_actions": {
          actions: ["send-notification", "scale-service", "get-logs", "get-metrics"],
          conditions: ["Service is not critical", "No database dependencies"],
          safetyLevel: "low"
        }
      },
      actionGuidelines: {
        "restart-pod": {
          safetyLevel: "medium",
          prerequisites: ["Verify service is not critical", "Check for data loss risk"],
          safeFor: ["user-api", "analytics-worker", "redis-cache", "nginx-proxy"],
          unsafeFor: ["postgres-primary", "mysql-primary", "mongodb-primary"],
          bestPractices: ["Use rolling restart", "Check dependencies", "Monitor after restart"]
        },
        "scale-service": {
          safetyLevel: "low",
          prerequisites: ["Check resource availability", "Verify scaling limits"],
          safeFor: ["user-api", "analytics-worker", "redis-cache", "nginx-proxy"],
          unsafeFor: ["postgres-primary"],
          bestPractices: ["Scale gradually", "Monitor resource usage", "Set reasonable limits"]
        },
        "rollback-deployment": {
          safetyLevel: "high",
          prerequisites: ["Verify rollback target", "Check data compatibility", "Get approval"],
          safeFor: ["user-api", "analytics-worker", "nginx-proxy"],
          unsafeFor: ["postgres-primary", "mysql-primary", "mongodb-primary"],
          bestPractices: ["Test rollback plan", "Backup current state", "Monitor during rollback"]
        },
        "send-notification": {
          safetyLevel: "low",
          prerequisites: ["Verify recipients", "Check notification content"],
          safeFor: ["all-services"],
          bestPractices: ["Include relevant details", "Set appropriate urgency", "Follow escalation procedures"]
        },
        "enable-circuit-breaker": {
          safetyLevel: "high",
          prerequisites: ["Verify circuit breaker configuration", "Check service dependencies"],
          safeFor: ["user-api", "analytics-worker"],
          unsafeFor: ["postgres-primary", "mysql-primary"],
          bestPractices: ["Test circuit breaker", "Monitor fallback behavior", "Set appropriate thresholds"]
        }
      },
      escalationProcedures: {
        "critical_incident": {
          contacts: ["sre-oncall@company.com", "engineering-manager@company.com"],
          channels: ["#incidents", "#sre-alerts"],
          timeline: "Immediate notification required"
        },
        "database_incident": {
          contacts: ["database-team@company.com", "sre-oncall@company.com"],
          channels: ["#database-alerts", "#incidents"],
          timeline: "Immediate notification required"
        },
        "high_severity": {
          contacts: ["sre-oncall@company.com"],
          channels: ["#sre-alerts"],
          timeline: "Notification within 5 minutes"
        },
        "medium_severity": {
          contacts: ["sre-team@company.com"],
          channels: ["#sre-alerts"],
          timeline: "Notification within 15 minutes"
        }
      },
      riskAssessment: {
        "low_risk": {
          actions: ["send-notification", "get-logs", "get-metrics"],
          conditions: ["Non-critical service", "No data loss risk", "Reversible action"]
        },
        "medium_risk": {
          actions: ["restart-pod", "scale-service"],
          conditions: ["Service has dependencies", "Potential temporary impact", "Reversible with effort"]
        },
        "high_risk": {
          actions: ["rollback-deployment", "enable-circuit-breaker"],
          conditions: ["Critical service", "Potential data loss", "Requires approval"]
        }
      }
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(guidelines, null, 2)
      }]
    };
  });

  // Tool: Restart a pod with AI decision making
  server.tool("restart-pod", {
    podName: z.string().describe("Name of the pod to restart"),
    namespace: z.string().optional().describe("Kubernetes namespace (default: production)"),
    incidentType: z.string().optional().describe("Type of incident for context"),
    reason: z.string().optional().describe("Reason for restart")
  }, async ({ podName, namespace = 'production', incidentType, reason }, extra) => {
      env.logger.info('AI-powered pod restart decision', { podName, namespace, incidentType, reason });

      try {
        // Use AI to determine if pod restart is safe and appropriate
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE remediation agent. Decide whether pod restarts are safe and appropriate.

SAFETY RULES:
- OOM/Memory issues: SAFE to restart (stateless services)
- Database services: NOT SAFE (data loss risk)
- Stateful services: NOT SAFE (data loss risk)
- Load balancers: CAUTION (service disruption)
- Monitoring services: CAUTION (observability loss)

POD TYPES:
- user-api: Stateless, SAFE to restart
- postgres-primary: Stateful database, NOT SAFE
- redis-cache: Stateful cache, NOT SAFE
- nginx-proxy: Load balancer, CAUTION
- analytics-worker: Stateless, SAFE to restart

Return JSON with decision and reasoning.`
            },
            {
              role: 'user',
              content: `Should I restart this pod?
Pod: ${podName}
Namespace: ${namespace}
Incident Type: ${incidentType || 'unknown'}
Reason: ${reason || 'No reason provided'}

Return JSON with:
{
  "safeToRestart": true|false,
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "risks": ["list of potential risks"],
  "alternatives": ["alternative actions if not safe"],
  "recommendedAction": "restart|investigate|escalate"
}`
            }
          ],
          max_tokens: 400,
          temperature: 0.2
        });

        const aiDecision = aiResponse.choices?.[0]?.message?.content || '{}';
        env.logger.info('AI restart decision completed', { podName, decision: aiDecision });

        // Parse AI response
        let decision;
        try {
          const jsonMatch = aiDecision.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            decision = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch (parseError) {
          env.logger.warn('Failed to parse AI response, using conservative approach', { parseError: String(parseError) });
          decision = {
            safeToRestart: false,
            confidence: 0.1,
            reasoning: 'AI parsing failed, using conservative approach',
            risks: ['Unknown safety implications'],
            alternatives: ['Investigate further'],
            recommendedAction: 'investigate'
          };
        }

        // Execute restart if AI deems it safe
        if (decision.safeToRestart && decision.confidence > 0.7) {
          env.logger.info('AI approved pod restart', { podName, confidence: decision.confidence });
          
          // Simulate pod restart with realistic timing
          const restartResult = {
            action: 'pod_restart',
            podName,
            namespace,
            timestamp: new Date().toISOString(),
            status: 'success',
            aiDecision: decision,
            details: {
              previousState: 'OOMKilled',
              newState: 'Running',
              restartCount: 6,
              timeToReady: '45s',
              confidence: decision.confidence
            },
            commands: [
              `kubectl delete pod ${podName} -n ${namespace}`,
              `kubectl wait --for=condition=Ready pod -l app=${podName.split('-')[0]} -n ${namespace}`
            ]
          };

          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 1000));

          env.logger.info('Pod restart completed successfully', { podName, status: 'success' });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(restartResult, null, 2)
            }]
          };
        } else {
          env.logger.warn('AI rejected pod restart', { podName, reasoning: decision.reasoning });
          
          const rejectionResult = {
            action: 'pod_restart',
            podName,
            namespace,
            timestamp: new Date().toISOString(),
            status: 'rejected',
            aiDecision: decision,
            details: {
              reason: 'AI determined restart is not safe',
              confidence: decision.confidence,
              risks: decision.risks,
              alternatives: decision.alternatives
            },
            recommendedAction: decision.recommendedAction
          };

          return {
            content: [{
              type: "text",
              text: JSON.stringify(rejectionResult, null, 2)
            }]
          };
        }

      } catch (error) {
        env.logger.error('AI restart decision failed', { podName, error: String(error) });
        
        // Conservative fallback - don't restart if AI fails
        const errorResult = {
          action: 'pod_restart',
          podName,
          namespace,
          timestamp: new Date().toISOString(),
          status: 'error',
          details: {
            reason: 'AI decision making failed',
            error: String(error),
            recommendation: 'Manual review required'
          }
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(errorResult, null, 2)
          }]
        };
      }
    });

  // Tool: Send notification with AI-generated content
  server.tool("send-notification", {
    message: z.string().describe("Notification message content"),
    severity: z.string().optional().describe("Incident severity (low/medium/high/critical)"),
    channel: z.string().optional().describe("Notification channel (email/slack/pagerduty)"),
    incidentType: z.string().optional().describe("Type of incident for context"),
    serviceName: z.string().optional().describe("Affected service name")
  }, async ({ message, severity = 'medium', channel = 'email', incidentType, serviceName }, extra) => {
      env.logger.info('AI-powered notification generation', { message, severity, channel, incidentType, serviceName });

      try {
        // Use AI to enhance notification content
        const aiResponse = await env.AI.run('gpt-oss-120b', {
          model: 'gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: `You are an expert SRE communication agent. Generate clear, actionable incident notifications.

NOTIFICATION GUIDELINES:
- Be concise but informative
- Include key details: service, impact, status
- Provide next steps or actions taken
- Use appropriate tone for severity level
- Include relevant technical details

SEVERITY LEVELS:
- low: Informational, minor impact
- medium: Moderate impact, monitoring required
- high: Significant impact, immediate attention
- critical: Severe impact, emergency response

CHANNEL ADAPTATIONS:
- email: Formal, detailed, full context
- slack: Concise, emoji, quick updates
- pagerduty: Urgent, action-oriented, escalation info`
            },
            {
              role: 'user',
              content: `Generate an enhanced notification:
Original Message: ${message}
Severity: ${severity}
Channel: ${channel}
Incident Type: ${incidentType || 'unknown'}
Service: ${serviceName || 'unknown'}

Return JSON with:
{
  "enhancedMessage": "improved notification content",
  "recipients": ["list of appropriate recipients"],
  "urgency": "low|medium|high|critical",
  "nextSteps": ["immediate actions to take"],
  "escalation": "when to escalate",
  "technicalDetails": "relevant technical info"
}`
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        });

        const aiNotification = aiResponse.choices?.[0]?.message?.content || '{}';
        env.logger.info('AI notification generation completed', { severity, contentLength: aiNotification.length });

        // Parse AI response
        let notificationData;
        try {
          const jsonMatch = aiNotification.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            notificationData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in AI response');
          }
        } catch (parseError) {
          env.logger.warn('Failed to parse AI response, using original message', { parseError: String(parseError) });
          notificationData = {
            enhancedMessage: message,
            recipients: ['oncall-sre@company.com'],
            urgency: severity,
            nextSteps: ['Monitor the situation'],
            escalation: 'If issue persists for 15 minutes',
            technicalDetails: 'No additional details available'
          };
        }

        // Determine recipients based on severity and AI recommendations
        const recipients = severity === 'critical' ? 
          ['oncall-sre@company.com', 'senior-sre@company.com', '#incidents-critical'] :
          severity === 'high' ?
          ['oncall-sre@company.com', '#incidents-channel'] :
          ['oncall-sre@company.com'];

        const notificationResult = {
          action: 'send_notification',
          timestamp: new Date().toISOString(),
          status: 'delivered',
          aiEnhanced: true,
          details: {
            originalMessage: message,
            enhancedMessage: notificationData.enhancedMessage || message,
            severity,
            channel,
            recipients: notificationData.recipients || recipients,
            messageId: `notif-${crypto.randomUUID()}`,
            deliveryTime: '2.3s',
            urgency: notificationData.urgency || severity,
            nextSteps: notificationData.nextSteps || [],
            escalation: notificationData.escalation || 'Standard escalation procedures',
            technicalDetails: notificationData.technicalDetails || 'No additional details'
          }
        };

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 500));

        env.logger.info('AI-enhanced notification sent successfully', { 
          severity, 
          recipients: notificationResult.details.recipients.length,
          enhanced: true
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(notificationResult, null, 2)
          }]
        };

      } catch (error) {
        env.logger.error('AI notification generation failed', { message, severity, error: String(error) });
        
        // Fallback to basic notification
        const fallbackResult = {
          action: 'send_notification',
          timestamp: new Date().toISOString(),
          status: 'delivered',
          aiEnhanced: false,
          details: {
            message,
            severity,
            channel,
            recipients: ['oncall-sre@company.com'],
            messageId: `notif-${crypto.randomUUID()}`,
            deliveryTime: '2.3s',
            note: 'AI enhancement failed, using original message'
          }
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallbackResult, null, 2)
          }]
        };
      }
    });

  // Tool: Scale service (requires approval - not autonomous)
  server.tool("scale-service", {
    serviceName: z.string().describe("Name of the service to scale"),
    replicas: z.number().describe("Target number of replicas"),
    namespace: z.string().optional().describe("Kubernetes namespace (default: production)")
  }, async ({ serviceName, replicas, namespace = 'production' }, extra) => {
      env.logger.info('Service scaling requested', { serviceName, replicas, namespace });

      // This action requires manual approval - not autonomous
      const scalingResult = {
        action: 'scale_service',
        serviceName,
        namespace,
        requestedReplicas: replicas,
        timestamp: new Date().toISOString(),
        status: 'approval_required',
        details: {
          currentReplicas: 2,
          targetReplicas: replicas,
          approvalRequired: true,
          reason: 'Scaling operations require manual approval for safety'
        },
        nextSteps: [
          'Submit scaling request to operations team',
          'Wait for approval from senior SRE',
          'Execute scaling after approval'
        ]
      };

      env.logger.warn('Scaling requires manual approval', { serviceName, replicas });

      return {
        content: [{
          type: "text",
          text: JSON.stringify(scalingResult, null, 2)
        }]
      };
    });

  // Tool: Check remediation status
  server.tool("get-remediation-status", {
    actionId: z.string().optional().describe("Specific action ID to check")
  }, async ({ actionId }, extra) => {
      env.logger.info('Checking remediation status', { actionId });

      const statusResult = {
        timestamp: new Date().toISOString(),
        recentActions: [
          {
            id: 'restart-001',
            action: 'pod_restart',
            target: 'user-api-deployment-abc123',
            status: 'completed',
            timestamp: '2024-09-14T10:31:00Z'
          },
          {
            id: 'notify-001',
            action: 'send_notification',
            target: 'oncall-team',
            status: 'delivered',
            timestamp: '2024-09-14T10:30:45Z'
          }
        ],
        systemHealth: {
          autonomousActionsEnabled: true,
          lastHealthCheck: new Date().toISOString(),
          queueDepth: 0
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(statusResult, null, 2)
        }]
      };
    });
}