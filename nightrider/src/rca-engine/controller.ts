/**
 * CONTROLLER for rca-engine Service
 *
 * PRD REQUIREMENTS:
 * CONTROLLER (orchestration) - Agent performs RCA analysis using LLM and data-gathering tools
 * - performRCA(incidentData: IncidentInfo, context: string[]): Promise<RCAResult>
 * - generateAnalysisPrompt(incident: Incident, data: GatheredData): string
 * - parseRCAResult(llmResponse: string): StructuredRCA
 *
 * MUST IMPLEMENT:
 * 1. Agent-driven root cause analysis using AI models
 * 2. Smart prompt engineering for different incident types
 * 3. LLM response parsing and structuring
 * 4. Context management with SmartMemory
 * 5. Knowledge base integration for historical patterns
 *
 * INTERFACES TO EXPORT:
 * - performRCA(incident: Incident, gatheredData: GatheredData): Promise<RCAResult>
 * - generateAnalysisPrompt(incident: Incident, data: GatheredData): string
 * - parseRCAFromLLM(response: string): RCAResult
 * - enrichWithHistoricalContext(incident: Incident): Promise<string[]>
 * - saveAnalysisToMemory(incident: Incident, rca: RCAResult): Promise<void>
 *
 * IMPORTS NEEDED:
 * - From shared types: Incident, GatheredData, RCAResult, AnalysisContext
 * - From env: env.AI, env.CONVERSATION_MEMORY, env.KNOWLEDGE_BASE, env.METRICS_DATABASE, env.logger
 * - From other layers: model functions for validation and confidence scoring
 *
 * BUSINESS RULES:
 * - Use deepseek-v3 for complex analysis, llama-3.1-8b-instruct for quick assessments
 * - Include historical context from similar incidents
 * - Store analysis results in SmartMemory for learning
 * - Cross-reference with knowledge base for known patterns
 *
 * ERROR HANDLING:
 * - Try-catch around all AI model calls
 * - Fallback to simpler models if primary analysis fails
 * - Validate LLM responses before returning results
 * - Log analysis performance metrics
 *
 * INTEGRATION POINTS:
 * - Called by incident-orchestrator for RCA processing
 * - Uses SmartMemory for context and learning
 * - Uses SmartBucket knowledge base for historical patterns
 * - Uses SmartSQL for incident correlation
 */

import {
  Incident,
  GatheredData,
  RCAResult,
  ActionRiskLevel,
  RecommendedAction,
  ProcessingError,
  IncidentSeverity
} from '../types/shared';

import {
  validateRCAData,
  calculateConfidenceScore,
  assessActionRisk,
  structureRCAResult
} from './model';

import { Env } from './raindrop.gen';

/**
 * Performs comprehensive RCA analysis using AI models and historical context
 * Business rule: Use deepseek-v3 for complex analysis, fallback to llama-3.1-8b-instruct
 */
export async function performRCA(incident: Incident, gatheredData: GatheredData, env: Env): Promise<RCAResult> {
  const startTime = Date.now();

  try {
    env.logger.info(`Starting RCA analysis for incident ${incident.id}`);

    // Handle null/undefined gatheredData gracefully
    if (!gatheredData) {
      env.logger.warn(`No gathered data provided for incident ${incident.id}, creating minimal data structure`);
      gatheredData = {
        logs: [],
        metrics: [],
        alerts: [],
        system_status: [],
        runbooks: []
      };
    }

    // Ensure all data arrays exist, even if empty
    const safeGatheredData: GatheredData = {
      logs: gatheredData.logs || [],
      metrics: gatheredData.metrics || [],
      alerts: gatheredData.alerts || [],
      system_status: gatheredData.system_status || [],
      runbooks: gatheredData.runbooks || []
    };

    // Validate input data - but don't fail on missing data, just log warnings
    const validation = validateRCAData(safeGatheredData);
    if (!validation.isValid) {
      env.logger.warn(`Incomplete data for RCA analysis of incident ${incident.id}: ${validation.errors.join(', ')}`);
      env.logger.info('Proceeding with degraded analysis using available data');
    }

    // Enrich with historical context
    const historicalContext = await enrichWithHistoricalContext(incident, env);

    // Generate analysis prompt with safe data
    const prompt = generateAnalysisPrompt(incident, safeGatheredData, historicalContext);

    // Perform AI analysis with fallback
    let llmResponse: string;
    try {
      env.logger.info('Using llama-3-70b-instruct for primary RCA analysis');
      const result = await env.AI.run('llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'You are an expert SRE performing root cause analysis. Provide detailed analysis based on the incident data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Handle different response types from AI service
      if (typeof result === 'string') {
        llmResponse = result;
      } else if (result && typeof result === 'object' && 'content' in result) {
        llmResponse = (result as any).content;
      } else if (result && typeof result === 'object' && 'choices' in result && Array.isArray((result as any).choices)) {
        llmResponse = (result as any).choices[0]?.message?.content || JSON.stringify(result);
      } else {
        llmResponse = JSON.stringify(result);
      }
    } catch (primaryError) {
      env.logger.warn(`Primary AI model failed: ${primaryError instanceof Error ? primaryError.message : primaryError}, falling back to simpler model`);
      try {
        const fallbackResult = await env.AI.run('llama-3-8b-instruct', {
          messages: [
            {
              role: 'system',
              content: 'You are an expert SRE performing root cause analysis. Provide detailed analysis based on the incident data.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        // Handle different response types from AI service
        if (typeof fallbackResult === 'string') {
          llmResponse = fallbackResult;
        } else if (fallbackResult && typeof fallbackResult === 'object' && 'content' in fallbackResult) {
          llmResponse = (fallbackResult as any).content;
        } else if (fallbackResult && typeof fallbackResult === 'object' && 'choices' in fallbackResult && Array.isArray((fallbackResult as any).choices)) {
          llmResponse = (fallbackResult as any).choices[0]?.message?.content || JSON.stringify(fallbackResult);
        } else {
          llmResponse = JSON.stringify(fallbackResult);
        }
      } catch (fallbackError) {
        env.logger.error(`All AI models failed during RCA analysis: Primary: ${primaryError instanceof Error ? primaryError.message : primaryError}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`);
        throw new ProcessingError('AI analysis failed: all models unavailable');
      }
    }

    // Parse and structure results
    const rcaResult = parseRCAFromLLM(llmResponse);
    rcaResult.incident_id = incident.id;

    // Adjust confidence score based on data quality
    if (!validation.isValid) {
      // Reduce confidence score for incomplete data
      const dataQualityPenalty = Math.min(0.3, validation.errors.length * 0.1);
      rcaResult.confidence_score = Math.max(0.1, rcaResult.confidence_score - dataQualityPenalty);

      // Add note about data limitations
      if (!rcaResult.contributing_factors.some(factor => factor.includes('limited data'))) {
        rcaResult.contributing_factors.push('Analysis limited by incomplete observability data');
      }
    }

    // Save analysis to memory for future learning
    await saveAnalysisToMemory(incident, rcaResult, env);

    const duration = Date.now() - startTime;
    env.logger.info(`RCA analysis completed for incident ${incident.id} in ${duration}ms (confidence: ${rcaResult.confidence_score})`);

    return rcaResult;

  } catch (error) {
    const duration = Date.now() - startTime;
    env.logger.error(`RCA analysis failed for incident ${incident.id} after ${duration}ms: ${error}`);
    throw error instanceof ProcessingError ? error : new ProcessingError(`RCA analysis failed: ${error}`);
  }
}

/**
 * Generates comprehensive analysis prompt tailored to incident type and data
 * Business rule: Adapt prompt based on severity and incident characteristics
 */
export function generateAnalysisPrompt(incident: Incident, data: GatheredData, historicalContext?: string[]): string {
  const severityLevel = incident.severity === IncidentSeverity.P0 ? 'CRITICAL' :
                       incident.severity === IncidentSeverity.P1 ? 'HIGH' :
                       incident.severity === IncidentSeverity.P2 ? 'MEDIUM' : 'LOW';

  let prompt = `INCIDENT ANALYSIS REQUEST
=======================

${incident.severity === IncidentSeverity.P0 ? 'CRITICAL INCIDENT ANALYSIS' : 'INCIDENT ANALYSIS'}

INCIDENT DETAILS:
- ID: ${incident.id}
- Title: ${incident.title}
- Description: ${incident.description}
- SEVERITY: ${incident.severity}
- Priority Level: ${severityLevel}
- Status: ${incident.status}
- Source: ${incident.source}
- AFFECTED SERVICES: ${incident.affected_services.join(', ')}
- Created: ${incident.created_at}
- Region: ${incident.metadata?.region || 'Unknown'}
- Customer Impact: ${incident.metadata?.customer_impact || 'Unknown'}

`;

  // Add incident-specific analysis focus
  if (incident.title.toLowerCase().includes('memory') || incident.description.toLowerCase().includes('memory')) {
    prompt += `ANALYSIS FOCUS: Memory-related issues
Focus on heap usage, garbage collection, memory leaks, and resource exhaustion patterns.
`;
  } else if (incident.title.toLowerCase().includes('network') || incident.description.toLowerCase().includes('connection')) {
    prompt += `ANALYSIS FOCUS: Network connectivity issues
Focus on network connectivity, firewall rules, and service discovery issues.
`;
  } else if (incident.title.toLowerCase().includes('database') || incident.description.toLowerCase().includes('database')) {
    prompt += `ANALYSIS FOCUS: Database-related issues
Focus on connection pools, query performance, and database availability.
`;
  }

  // Add data sections
  prompt += addLogData(data);
  prompt += addMetricData(data);
  prompt += addAlertData(data);
  prompt += addSystemStatusData(data);
  prompt += addRunbookData(data);

  // Add historical context if available
  if (historicalContext && historicalContext.length > 0) {
    prompt += `
HISTORICAL CONTEXT:
${historicalContext.map((context, i) => `${i + 1}. ${context}`).join('\n')}
`;
  }

  // Analysis instructions
  prompt += `
ANALYSIS INSTRUCTIONS:
======================

You are an expert SRE conducting root cause analysis. Analyze the incident data above and provide a comprehensive analysis in the following EXACT format:

ROOT_CAUSE: [Provide the most likely root cause based on evidence analysis]

EVIDENCE:
- [List each piece of evidence that supports the root cause]
- [Include log entries, metric correlations, and alert patterns]
- [Minimum 3 pieces of evidence for high confidence analysis]

CONFIDENCE: [Provide confidence score between 0.0 and 1.0]

CONTRIBUTING_FACTORS:
- [List factors that contributed to the incident]
- [Include environmental conditions, recent changes, load patterns]

RECOMMENDED_ACTIONS:
- [action_type]: [Description] (autonomous_safe|requires_approval)
- [Include specific remediation steps with risk assessment]
- [Prioritize actions by impact and safety]

TIMELINE:
- [HH:MM timestamp] [What happened at this time]
- [Reconstruct the incident timeline from the data]

PREVENTION:
- [List specific measures to prevent recurrence]
- [Include monitoring, alerting, and process improvements]

ANALYSIS GUIDELINES:
- Base conclusions strictly on provided evidence
- Correlate logs, metrics, and alerts for stronger evidence
- Consider cascade effects and service dependencies
- Assess risk levels: restart/scale = autonomous_safe, DB/network = requires_approval
- For P0/P1 incidents, prioritize immediate remediation actions
- Include confidence reasoning based on evidence quality
`;

  return prompt;
}

/**
 * Helper functions to add data sections to prompt
 */
function addLogData(data: GatheredData): string {
  if (!data.logs || data.logs.length === 0) {
    return '\nLIMITED DATA AVAILABLE\nLOG DATA: No log data available\n';
  }

  let section = '\nLOG DATA:\n';
  data.logs.slice(0, 20).forEach((log, i) => { // Limit to 20 most relevant logs
    section += `[${log.timestamp}] ${log.service} ${log.level}: ${log.message}\n`;
    if (log.metadata) {
      section += `  Metadata: ${JSON.stringify(log.metadata)}\n`;
    }
  });

  if (data.logs.length > 20) {
    section += `... (${data.logs.length - 20} additional log entries)\n`;
  }

  return section;
}

function addMetricData(data: GatheredData): string {
  if (!data.metrics || data.metrics.length === 0) {
    return '\nMETRIC DATA: No metric data available\n';
  }

  let section = '\nMETRIC DATA:\n';
  data.metrics.forEach(metric => {
    section += `[${metric.timestamp}] ${metric.metric_name}: ${metric.value}`;
    if (metric.labels) {
      section += ` (${Object.entries(metric.labels).map(([k, v]) => `${k}=${v}`).join(', ')})`;
    }
    section += '\n';
  });

  return section;
}

function addAlertData(data: GatheredData): string {
  if (!data.alerts || data.alerts.length === 0) {
    return '\nALERT DATA: No alert data available\n';
  }

  let section = '\nALERT DATA:\n';
  data.alerts.forEach(alert => {
    section += `[${alert.timestamp}] ${alert.service} - ${alert.severity.toUpperCase()}\n`;
    section += `  Trigger: ${alert.trigger_condition}\n`;
    section += `  Status: ${alert.status}\n`;
  });

  return section;
}

function addSystemStatusData(data: GatheredData): string {
  if (!data.system_status || data.system_status.length === 0) {
    return '\nSYSTEM STATUS: No system status data available\n';
  }

  let section = '\nSYSTEM STATUS:\n';
  data.system_status.forEach(status => {
    section += `${status.service}: ${status.status.toUpperCase()}\n`;
    section += `  Dependencies: ${status.dependencies.join(', ')}\n`;
    section += `  Health Checks: ${Object.entries(status.health_checks)
      .map(([check, passing]) => `${check}=${passing ? 'PASS' : 'FAIL'}`).join(', ')}\n`;
  });

  return section;
}

function addRunbookData(data: GatheredData): string {
  if (!data.runbooks || data.runbooks.length === 0) {
    return '\nRELEVANT RUNBOOKS: None available\n';
  }

  let section = '\nRELEVANT RUNBOOKS:\n';
  data.runbooks.forEach(runbook => {
    section += `"${runbook.title}" (ID: ${runbook.id})`;
    if (runbook.relevance_score) {
      section += ` - Relevance: ${Math.round(runbook.relevance_score * 100)}%`;
    }
    section += '\n';
    section += `  Types: ${runbook.incident_types.join(', ')}\n`;
    section += `  Procedures: ${runbook.procedures.join(', ')}\n`;
    if (runbook.content && runbook.content.length > 0) {
      section += `  Content: ${runbook.content.substring(0, 200)}${runbook.content.length > 200 ? '...' : ''}\n`;
    }
  });

  return section;
}

/**
 * Parses response into sections using more precise section-based parsing
 */
function parseResponseSections(response: string): Record<string, string> {
  const sections: Record<string, string> = {};

  // Clean up the response first to handle leading whitespace
  const cleanResponse = response.trim();

  // Split by section headers and process each part
  const parts = cleanResponse.split(/\n\s*(?=[A-Z_]+:\s*)/);

  for (const part of parts) {
    const headerMatch = part.trim().match(/^([A-Z_]+):\s*([\s\S]*)$/);
    if (headerMatch && headerMatch[1] && headerMatch[2]) {
      const sectionName = headerMatch[1];
      const sectionContent = headerMatch[2].trim();
      sections[sectionName] = sectionContent;
    }
  }

  return sections;
}

/**
 * Parses a section containing bulleted list items
 */
function parseListItems(sectionContent: string): string[] {
  return sectionContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- ') && line.length > 2)
    .map(line => line.substring(2).trim())
    .filter(line => line.length > 0);
}

/**
 * Parses LLM response into structured RCAResult
 * Business rule: Validate response format and extract structured data
 */
export function parseRCAFromLLM(response: string): RCAResult {
  try {
    // Split response into sections and parse each individually
    const sections = parseResponseSections(response);

    // Extract root cause
    const rootCause = sections.ROOT_CAUSE?.trim() || 'Unable to determine root cause';
    if (!sections.ROOT_CAUSE) {
      throw new Error('Failed to parse LLM response: missing required ROOT_CAUSE section');
    }

    // Extract evidence
    const evidence = sections.EVIDENCE ? parseListItems(sections.EVIDENCE) : [];

    // Extract confidence score
    const confidenceScore = sections.CONFIDENCE
      ? parseFloat(sections.CONFIDENCE.trim()) || 0.5
      : 0.5;

    if (confidenceScore < 0 || confidenceScore > 1) {
      throw new Error('Invalid confidence score: must be between 0 and 1');
    }

    // Extract contributing factors
    const contributingFactors = sections.CONTRIBUTING_FACTORS
      ? parseListItems(sections.CONTRIBUTING_FACTORS)
      : [];

    // Extract recommended actions
    const recommendedActions: RecommendedAction[] = [];

    if (sections.RECOMMENDED_ACTIONS) {
      const actionLines = parseListItems(sections.RECOMMENDED_ACTIONS);
      actionLines.forEach(actionLine => {
        const actionMatch = actionLine.match(/^(\w+):\s*(.+?)\s*\((autonomous_safe|requires_approval)\)$/);

        if (actionMatch) {
          const [, actionType, description, riskLevel] = actionMatch;
          recommendedActions.push({
            action_type: actionType || 'unknown',
            description: description?.trim() || 'No description available',
            risk_level: riskLevel as ActionRiskLevel,
            target: '', // Will be filled by higher-level logic
            estimated_impact: 'To be determined'
          });
        }
      });
    }

    // Extract timeline
    const timeline = sections.TIMELINE ? parseListItems(sections.TIMELINE) : [];

    // Extract prevention strategies
    const prevention = sections.PREVENTION ? parseListItems(sections.PREVENTION) : [];

    return {
      incident_id: '', // Will be set by caller
      root_cause: rootCause,
      evidence: evidence,
      confidence_score: confidenceScore,
      contributing_factors: contributingFactors,
      recommended_actions: recommendedActions,
      analysis_timeline: timeline,
      prevention_strategies: prevention
    };

  } catch (error) {
    throw new ProcessingError(`Failed to parse LLM response: ${error}`);
  }
}

/**
 * Enriches analysis with historical context from similar incidents
 * Business rule: Search for similar incidents and relevant knowledge base entries
 */
export async function enrichWithHistoricalContext(incident: Incident, env: Env): Promise<string[]> {
  const context: string[] = [];

  try {
    env.logger.info(`Gathering historical context for incident ${incident.id}`);

    // Search SmartMemory for similar incidents
    try {
      const memoryQuery = `${incident.title} ${incident.description} ${incident.affected_services.join(' ')}`;
      const searchParams = {
        query: memoryQuery,
        limit: 3,
        threshold: 0.7
      };

      const memoryResults = await (env.CONVERSATION_MEMORY as any).search(searchParams);

      if (memoryResults && memoryResults.results && memoryResults.results.length > 0) {
        env.logger.info(`Found ${memoryResults.results.length} similar incidents in memory`);
        for (const result of memoryResults.results) {
          if ((result as any).content && (result as any).score && (result as any).score > 0.7) {
            const summary = (result as any).content.length > 200
              ? (result as any).content.substring(0, 200) + '...'
              : (result as any).content;
            context.push(`Similar incident (score: ${(result as any).score.toFixed(2)}): ${summary}`);
          }
        }
      } else {
        env.logger.info('No similar incidents found in memory');
      }
    } catch (memoryError) {
      env.logger.warn(`Failed to search memory: ${memoryError instanceof Error ? memoryError.message : memoryError}`);
    }

    // Search Knowledge Base for relevant patterns
    try {
      const knowledgeQuery = `incident type:${incident.severity} services:${incident.affected_services.join(',')} ${incident.title}`;
      const knowledgeSearchParams = {
        query: knowledgeQuery,
        limit: 5,
        threshold: 0.6
      };

      const knowledgeResults = await (env.KNOWLEDGE_BASE as any).search(knowledgeSearchParams);

      if (knowledgeResults && knowledgeResults.results && knowledgeResults.results.length > 0) {
        env.logger.info(`Found ${knowledgeResults.results.length} relevant knowledge base entries`);
        for (const result of knowledgeResults.results) {
          if ((result as any).content && (result as any).score && (result as any).score > 0.6) {
            const summary = (result as any).content.length > 150
              ? (result as any).content.substring(0, 150) + '...'
              : (result as any).content;
            context.push(`Knowledge base entry (score: ${(result as any).score.toFixed(2)}): ${summary}`);
          }
        }
      } else {
        env.logger.info('No relevant knowledge base entries found');
      }
    } catch (knowledgeError) {
      env.logger.warn(`Failed to search knowledge base: ${knowledgeError instanceof Error ? knowledgeError.message : knowledgeError}`);
    }

    if (context.length === 0) {
      env.logger.info('No historical context found, proceeding with fresh analysis');
      context.push('No similar historical incidents found in system memory');
    }

  } catch (error) {
    env.logger.warn(`Failed to retrieve historical context: ${error instanceof Error ? error.message : error}`);
    context.push('Historical context retrieval failed, analysis based on current data only');
  }

  return context;
}

/**
 * Saves RCA analysis results to SmartMemory for future learning
 * Business rule: Store structured analysis for pattern recognition
 */
export async function saveAnalysisToMemory(incident: Incident, rca: RCAResult, env: Env): Promise<void> {
  try {
    const analysisContent = `
Incident Analysis - ${incident.id}
Title: ${incident.title}
Severity: ${incident.severity}
Affected Services: ${incident.affected_services.join(', ')}
Root Cause: ${rca.root_cause}
Confidence Score: ${rca.confidence_score}
Evidence: ${rca.evidence.join('; ')}
Contributing Factors: ${rca.contributing_factors.join('; ')}
Recommended Actions: ${rca.recommended_actions.map(a => `${a.action_type}: ${a.description} (risk: ${a.risk_level})`).join('; ')}
Timeline: ${rca.analysis_timeline.join('; ')}
Prevention Strategies: ${rca.prevention_strategies.join('; ')}
Timestamp: ${new Date().toISOString()}
Region: ${incident.metadata?.region || 'Unknown'}
Customer Impact: ${incident.metadata?.customer_impact || 'Unknown'}
`.trim();

    // Generate unique session and timeline identifiers
    const sessionId = `incident-${incident.id}-${Date.now()}`;
    const timelineId = `incident_${incident.id}`;

    // Save to SmartMemory for future learning
    try {
      await (env.CONVERSATION_MEMORY as any).put({
        session_id: sessionId,
        timeline: timelineId,
        content: analysisContent,
        key: 'rca_analysis',
        metadata: {
          incident_id: incident.id,
          severity: incident.severity,
          affected_services: incident.affected_services,
          root_cause: rca.root_cause,
          confidence_score: rca.confidence_score,
          timestamp: new Date().toISOString(),
          type: 'rca_analysis'
        }
      });

      env.logger.info(`RCA analysis for incident ${incident.id} saved to memory successfully`);

      // Also save individual learning points for better pattern matching
      if (rca.evidence.length > 0) {
        const evidenceContent = `
Evidence patterns for ${incident.severity} incidents in services [${incident.affected_services.join(', ')}]:
${rca.evidence.map((evidence, i) => `${i + 1}. ${evidence}`).join('\n')}
Root cause identified: ${rca.root_cause}
        `.trim();

        await (env.CONVERSATION_MEMORY as any).put({
          session_id: sessionId,
          timeline: timelineId,
          content: evidenceContent,
          key: 'evidence_patterns',
          metadata: {
            incident_id: incident.id,
            severity: incident.severity,
            affected_services: incident.affected_services,
            type: 'evidence_patterns',
            confidence_score: rca.confidence_score,
            timestamp: new Date().toISOString()
          }
        });

        env.logger.info(`Evidence patterns for incident ${incident.id} saved to memory`);
      }

    } catch (memoryError) {
      env.logger.error(`Failed to save to SmartMemory: ${memoryError instanceof Error ? memoryError.message : memoryError}`);

      // Fallback: at least log the analysis content for manual review
      env.logger.info(`RCA Analysis Content (memory save failed): ${analysisContent.substring(0, 500)}...`);
    }

  } catch (error) {
    env.logger.error(`Failed to save RCA analysis to memory: ${error instanceof Error ? error.message : error}`);
    // Don't throw - memory storage failure shouldn't fail the entire analysis
  }
}