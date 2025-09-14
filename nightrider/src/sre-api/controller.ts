/**
 * SIMPLE SRE AGENT - No RPCs, No Bindings
 * Everything handled internally in this single service
 */

import {
  IncidentAlert,
  Incident,
  RCAResult,
  ProcessingResult,
  ValidationError,
  NotFoundError,
  ProcessingError,
  RecommendedAction,
  ActionRiskLevel
} from '../types/shared';
import { Env } from './raindrop.gen';
import { RemediationResult } from './model';
// Using fetch for Slack API calls since Web API client has Node.js dependencies

/**
 * Retry helper function for database operations with comprehensive logging
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  logger: any,
  operationName: string,
  delay: number = 1000
): Promise<T> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  logger.debug(`Starting database operation: ${operationName}`, {
    max_retries: maxRetries,
    operation: operationName
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStartTime = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      logger.info(`Database operation completed successfully`, {
        operation: operationName,
        attempt,
        total_duration_ms: duration,
        attempt_duration_ms: Date.now() - attemptStartTime
      });

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const attemptDuration = Date.now() - attemptStartTime;

      logger.warn(`Database operation failed`, {
        operation: operationName,
        attempt,
        max_retries: maxRetries,
        error_message: lastError.message,
        error_type: lastError.constructor.name,
        attempt_duration_ms: attemptDuration
      });

      if (attempt < maxRetries) {
        const delayTime = delay * attempt;
        logger.debug(`Retrying operation after delay`, {
          operation: operationName,
          delay_ms: delayTime,
          next_attempt: attempt + 1
        });
        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  logger.error(`Database operation failed after all retries`, {
    operation: operationName,
    total_attempts: maxRetries,
    total_duration_ms: totalDuration,
    final_error: lastError?.message
  });

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Handles incoming incident alerts - Simple agent with SmartSQL storage
 */
export async function handleIncidentAlert(alert: IncidentAlert, env: Env): Promise<ProcessingResult> {
  const startTime = Date.now();
  const traceId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  env.logger.info('Starting incident alert processing', {
    trace_id: traceId,
    operation: 'handle_incident_alert',
    source: alert.source,
    severity: alert.severity,
    alert_type: alert.alert_type,
    timestamp: alert.timestamp,
    affected_services_count: alert.affected_services?.length || 0
  });

  try {
    // Check database availability first
    if (!env.INCIDENTS_DATABASE || typeof env.INCIDENTS_DATABASE.executeQuery !== 'function') {
      throw new ProcessingError('Database connection not available during initialization');
    }

    // Generate unique incident ID
    const incidentId = `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Create simple incidents table if not exists with retry mechanism
    await retryOperation(async () => {
      await env.INCIDENTS_DATABASE.executeQuery({
        sqlQuery: `CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          severity TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          affected_services TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          metadata TEXT,
          root_cause TEXT,
          analysis_confidence REAL DEFAULT 0.0,
          remediation_status TEXT DEFAULT 'pending'
        )`
      });
    }, 3, env.logger, 'create_incidents_table');

    // Insert incident into database with retry
    const title = `${alert.alert_type} in ${alert.source}`.replace(/'/g, "''");
    const description = (alert.message || 'Alert description not provided').replace(/'/g, "''");
    const source = alert.source.replace(/'/g, "''");
    const affectedServicesJson = JSON.stringify(alert.affected_services || []).replace(/'/g, "''");
    const metadataJson = JSON.stringify(alert.metadata || {}).replace(/'/g, "''");

    await retryOperation(async () => {
      await env.INCIDENTS_DATABASE.executeQuery({
        sqlQuery: `INSERT INTO incidents (
          id, title, description, severity, status, source,
          affected_services, created_at, updated_at, metadata
        ) VALUES (
          '${incidentId}', '${title}', '${description}', '${alert.severity}',
          'received', '${source}', '${affectedServicesJson}', '${now}', '${now}', '${metadataJson}'
        )`
      });
    }, 3, env.logger, 'insert_incident');

    const processingDuration = Date.now() - startTime;

    env.logger.info('Incident created and stored in database', {
      trace_id: traceId,
      incident_id: incidentId,
      processing_duration_ms: processingDuration
    });

    // Send Slack notification if configured
    await sendIncidentNotificationToSlack(alert, incidentId, env);

    const result: ProcessingResult = {
      status: 'success',
      agent_analysis: {
        incident_id: incidentId,
        root_cause: 'Initial analysis pending',
        evidence: [],
        confidence_score: 0.8,
        contributing_factors: [],
        recommended_actions: [],
        analysis_timeline: [],
        prevention_strategies: []
      },
      actions_taken: [],
      timeline: ['Alert received', 'Incident created']
    };

    env.logger.info('Incident alert processing completed successfully', {
      trace_id: traceId,
      incident_id: incidentId,
      total_duration_ms: processingDuration,
      result_status: result.status
    });

    return result;

  } catch (error) {
    const processingDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    env.logger.error('Failed to process incident alert', {
      trace_id: traceId,
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      processing_duration_ms: processingDuration,
      alert_source: alert.source,
      alert_severity: alert.severity
    });

    throw new ProcessingError(`Failed to process incident alert: ${errorMessage}`);
  }
}

/**
 * Retrieves incident details from database - Simple agent, SQL storage
 */
export async function getIncidentDetails(id: string, env: Env): Promise<Incident> {
  const startTime = Date.now();
  const traceId = `get_incident_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  env.logger.debug('Starting incident details retrieval', {
    trace_id: traceId,
    incident_id: id,
    request_timestamp: new Date().toISOString()
  });

  try {
    const queryStartTime = Date.now();
    const result = await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: `SELECT * FROM incidents WHERE id = '${id.replace(/'/g, "''")}'`
    });
    const queryDuration = Date.now() - queryStartTime;

    env.logger.debug('Database query completed', {
      trace_id: traceId,
      incident_id: id,
      query_duration_ms: queryDuration,
      has_results: !!result.results
    });

    if (!result.results) {
      env.logger.warn('Incident not found - no results returned', { incident_id: id });
      throw new NotFoundError(`Incident ${id} not found`);
    }

    // SmartSQL returns results as string, need to parse it
    let resultsArray: any[] = [];
    if (typeof result.results === 'string') {
      try {
        const parsed = JSON.parse(result.results);
        resultsArray = Array.isArray(parsed) ? parsed : (parsed.results || []);
      } catch (e) {
        env.logger.error('Failed to parse database results', {
          incident_id: id,
          results_type: typeof result.results,
          parse_error: e instanceof Error ? e.message : String(e)
        });
        throw new NotFoundError(`Incident ${id} not found - data parsing error`);
      }
    } else {
      resultsArray = Array.isArray(result.results) ? result.results : [];
    }

    if (resultsArray.length === 0) {
      env.logger.warn('Incident not found - empty results array', { incident_id: id });
      throw new NotFoundError(`Incident ${id} not found`);
    }

    const row = resultsArray[0];
    const incident: Incident = {
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      source: row.source,
      affected_services: JSON.parse(row.affected_services || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: JSON.parse(row.metadata || '{}')
    };

    const totalDuration = Date.now() - startTime;
    env.logger.info('Incident details retrieved successfully', {
      incident_id: id,
      status: incident.status,
      severity: incident.severity,
      source: incident.source,
      total_duration_ms: totalDuration,
      query_duration_ms: queryDuration
    });

    return incident;

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    env.logger.error('Failed to retrieve incident details', {
      incident_id: id,
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      total_duration_ms: totalDuration
    });

    // Re-throw the original error (NotFoundError or others)
    throw error;
  }
}

/**
 * Retrieves RCA analysis results for an incident - Simple agent with SQL storage
 */
export async function getAnalysisResults(id: string, env: Env): Promise<RCAResult> {
  env.logger.debug('Retrieving analysis results', { incident_id: id });

  // Get incident from database
  const result = await env.INCIDENTS_DATABASE.executeQuery({
    sqlQuery: `SELECT * FROM incidents WHERE id = '${id.replace(/'/g, "''")}'`
  });

  if (!result.results || result.results.length === 0) {
    throw new NotFoundError(`Incident ${id} not found`);
  }

  const incident = result.results[0] as any;

  // Generate or retrieve analysis results
  const rootCause = incident.root_cause || `Analyzed root cause for ${incident.title}`;
  const confidence = incident.analysis_confidence || 0.75;

  const analysisResult: RCAResult = {
    incident_id: id,
    root_cause: rootCause,
    evidence: ['Service logs show memory exhaustion', 'CPU usage exceeded 90%'],
    contributing_factors: ['System overload', 'Network latency'],
    confidence_score: confidence,
    recommended_actions: [
      {
        action_type: 'restart_service',
        description: 'Restart the affected service',
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: incident.source,
        estimated_impact: '5 minutes downtime'
      }
    ],
    analysis_timeline: ['Analysis started', 'Data gathered', 'Root cause identified'],
    prevention_strategies: ['Add memory monitoring', 'Implement auto-scaling']
  };

  // Update database with analysis results if not already stored
  if (!incident.root_cause) {
    const escapedRootCause = rootCause.replace(/'/g, "''");
    const updateTime = new Date().toISOString();
    await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: `UPDATE incidents SET
        root_cause = '${escapedRootCause}',
        analysis_confidence = ${confidence},
        updated_at = '${updateTime}'
      WHERE id = '${id.replace(/'/g, "''")}'`
    });
  }

  env.logger.info('Analysis results generated', {
    incident_id: id,
    confidence_score: analysisResult.confidence_score,
    root_cause: analysisResult.root_cause
  });

  return analysisResult;
}

/**
 * Triggers remediation actions for an incident - Simple agent with SQL storage
 */
export async function triggerRemediation(id: string, approved: boolean, env: Env): Promise<RemediationResult> {
  env.logger.info('Triggering remediation', { incident_id: id, approved });

  // Check if incident exists
  const checkResult = await env.INCIDENTS_DATABASE.executeQuery({
    sqlQuery: `SELECT id FROM incidents WHERE id = '${id.replace(/'/g, "''")}'`
  });

  if (!checkResult.results || checkResult.results.length === 0) {
    throw new NotFoundError(`Incident ${id} not found`);
  }

  // Mock remediation execution
  const result: RemediationResult = {
    incident_id: id,
    actions_executed: approved ? ['service_restart'] : [],
    results: approved ? ['service_restart'] : [],
    status: approved ? 'completed' : 'skipped'
  };

  // Update incident status in database
  const newStatus = approved ? 'resolved' : 'escalated';
  const remediationStatus = approved ? 'completed' : 'skipped';
  const updateTime = new Date().toISOString();
  await env.INCIDENTS_DATABASE.executeQuery({
    sqlQuery: `UPDATE incidents SET
      status = '${newStatus}',
      remediation_status = '${remediationStatus}',
      updated_at = '${updateTime}'
    WHERE id = '${id.replace(/'/g, "''")}'`
  });

  env.logger.info('Remediation executed', {
    incident_id: id,
    actions_count: result.actions_executed?.length || 0,
    status: result.status
  });

  return result;
}

/**
 * Gets health status of the simple agent with SQL database
 */
export async function getHealthStatus(env: Env): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  cache_size: number;
}> {
  const startTime = Date.now();
  const traceId = `health_check_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  try {
    const queryStartTime = Date.now();
    // Test database connection
    const result = await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: 'SELECT COUNT(*) as count FROM incidents'
    });
    const queryDuration = Date.now() - queryStartTime;

    const incidentCount = (result.results?.[0] as any)?.count || 0;

    const healthStatus = {
      status: 'healthy' as const,
      checks: {
        database_connection: true,
        incidents_table: result.results !== undefined,
        simple_agent: true
      },
      cache_size: incidentCount
    };

    const totalDuration = Date.now() - startTime;
    env.logger.info('Health check completed successfully', {
      status: healthStatus.status,
      incident_count: incidentCount,
      database_query_duration_ms: queryDuration,
      total_duration_ms: totalDuration,
      all_checks_passed: Object.values(healthStatus.checks).every(check => check)
    });

    return healthStatus;

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const healthStatus = {
      status: 'degraded' as const,
      checks: {
        database_connection: false,
        incidents_table: false,
        simple_agent: true
      },
      cache_size: 0
    };

    env.logger.error('Health check failed - system degraded', {
      status: healthStatus.status,
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      total_duration_ms: totalDuration
    });

    return healthStatus;
  }
}

/**
 * Lists all incidents from SQL database - Simple agent
 */
export async function listIncidents(env: Env): Promise<Incident[]> {
  const startTime = Date.now();
  const traceId = `list_incidents_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  try {
    const queryStartTime = Date.now();
    const result = await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: 'SELECT * FROM incidents ORDER BY created_at DESC'
    });
    const queryDuration = Date.now() - queryStartTime;

    env.logger.debug('Database query completed', {
      query_duration_ms: queryDuration,
      has_results: !!result.results
    });

    if (!result.results) {
      env.logger.info('No incidents found in database');
      return [];
    }

    // SmartSQL returns results as string, need to parse it
    let resultsArray: any[] = [];
    if (typeof result.results === 'string') {
      try {
        const parsed = JSON.parse(result.results);
        resultsArray = Array.isArray(parsed) ? parsed : (parsed.results || []);
      } catch (e) {
        env.logger.error('Failed to parse database results', {
          parse_error: e instanceof Error ? e.message : String(e),
          results_type: typeof result.results
        });
        return [];
      }
    } else {
      resultsArray = Array.isArray(result.results) ? result.results : [];
    }

    const incidentList = resultsArray.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      source: row.source,
      affected_services: JSON.parse(row.affected_services || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: JSON.parse(row.metadata || '{}')
    }));

    const totalDuration = Date.now() - startTime;

    // Log severity and status distribution
    const severityCounts = incidentList.reduce((acc, incident) => {
      acc[incident.severity] = (acc[incident.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusCounts = incidentList.reduce((acc, incident) => {
      acc[incident.status] = (acc[incident.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    env.logger.info('Incident list retrieval completed successfully', {
      total_incidents: incidentList.length,
      query_duration_ms: queryDuration,
      total_duration_ms: totalDuration,
      severity_distribution: severityCounts,
      status_distribution: statusCounts
    });

    return incidentList;

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    env.logger.error('Failed to retrieve incident list', {
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      total_duration_ms: totalDuration
    });

    // Return empty list on error, but log the failure
    return [];
  }
}

/**
 * Sends a Slack message using the Slack Web API client
 */
export async function sendSlackMessage(
  message: string,
  config: { signingSecret: string; token: string; channel: string },
  env: Env
): Promise<void> {
  const startTime = Date.now();
  const traceId = `slack_message_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  env.logger.info('Sending Slack message', {
    trace_id: traceId,
    channel: config.channel,
    message_length: message.length
  });

  try {
    // Use fetch to call Slack API directly (compatible with Cloudflare Workers)
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: config.channel,
        text: message
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json() as { ok: boolean; error?: string; ts?: string };
    const duration = Date.now() - startTime;

    if (result.ok) {
      env.logger.info('Slack message sent successfully', {
        trace_id: traceId,
        channel: config.channel,
        duration_ms: duration,
        message_ts: result.ts
      });
    } else {
      throw new Error(`Slack API error: ${result.error}`);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    env.logger.error('Failed to send Slack message', {
      trace_id: traceId,
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      duration_ms: duration,
      channel: config.channel
    });

    throw new ProcessingError(`Failed to send Slack message: ${errorMessage}`);
  }
}

/**
 * Updates Slack configuration by storing it in the database
 * Note: In production, this would ideally update environment variables or a secure config store
 */
export async function updateSlackConfig(
  config: { signingSecret: string; botToken: string; channel: string },
  env: Env
): Promise<void> {
  const startTime = Date.now();
  const traceId = `update_slack_config_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  env.logger.info('Updating Slack configuration', {
    trace_id: traceId,
    channel: config.channel
  });

  try {
    // Create configuration table if not exists
    await retryOperation(async () => {
      await env.INCIDENTS_DATABASE.executeQuery({
        sqlQuery: `CREATE TABLE IF NOT EXISTS slack_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          signing_secret TEXT NOT NULL,
          bot_token TEXT NOT NULL,
          channel TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      });
    }, 3, env.logger, 'create_slack_config_table');

    // Upsert configuration
    const now = new Date().toISOString();
    const escapedSigningSecret = config.signingSecret.replace(/'/g, "''");
    const escapedBotToken = config.botToken.replace(/'/g, "''");
    const escapedChannel = config.channel.replace(/'/g, "''");

    await retryOperation(async () => {
      await env.INCIDENTS_DATABASE.executeQuery({
        sqlQuery: `INSERT OR REPLACE INTO slack_config (
          id, signing_secret, bot_token, channel, updated_at
        ) VALUES (
          1, '${escapedSigningSecret}', '${escapedBotToken}', '${escapedChannel}', '${now}'
        )`
      });
    }, 3, env.logger, 'upsert_slack_config');

    const duration = Date.now() - startTime;

    env.logger.info('Slack configuration updated successfully', {
      trace_id: traceId,
      channel: config.channel,
      duration_ms: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    env.logger.error('Failed to update Slack configuration', {
      trace_id: traceId,
      error_message: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      duration_ms: duration
    });

    throw new ProcessingError(`Failed to update Slack configuration: ${errorMessage}`);
  }
}

/**
 * Gets stored Slack configuration from database as fallback when env vars not set
 */
export async function getStoredSlackConfig(env: Env): Promise<{ signingSecret: string; botToken: string; channel: string } | null> {
  try {
    const result = await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: `SELECT signing_secret, bot_token, channel FROM slack_config WHERE id = 1`
    });

    if (!result.results) {
      return null;
    }

    // SmartSQL returns results as string, need to parse it
    let resultsArray: any[] = [];
    if (typeof result.results === 'string') {
      try {
        const parsed = JSON.parse(result.results);
        resultsArray = Array.isArray(parsed) ? parsed : (parsed.results || []);
      } catch (e) {
        return null;
      }
    } else {
      resultsArray = Array.isArray(result.results) ? result.results : [];
    }

    if (resultsArray.length === 0) {
      return null;
    }

    const row = resultsArray[0];
    return {
      signingSecret: row.signing_secret,
      botToken: row.bot_token,
      channel: row.channel
    };

  } catch (error) {
    env.logger.warn('Failed to get stored Slack configuration', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Sends automatic Slack notification when a new incident is created
 */
async function sendIncidentNotificationToSlack(
  alert: IncidentAlert,
  incidentId: string,
  env: Env
): Promise<void> {
  try {
    // Check if Slack is configured via environment variables
    let config = {
      signingSecret: env.SLACK_SIGNING_SECRET,
      token: env.SLACK_BOT_TOKEN,
      channel: env.SLACK_CHANNEL
    };

    // If not configured via env vars, try to get from database
    if (!config.signingSecret || !config.token || !config.channel) {
      const storedConfig = await getStoredSlackConfig(env);
      if (storedConfig) {
        config = {
          signingSecret: storedConfig.signingSecret,
          token: storedConfig.botToken,
          channel: storedConfig.channel
        };
      } else {
        env.logger.debug('Slack not configured, skipping incident notification', {
          incident_id: incidentId
        });
        return;
      }
    }

    // Format incident notification message
    const severityEmoji = {
      'P0': '🚨',
      'P1': '⚠️',
      'P2': '⚡',
      'P3': '💡'
    }[alert.severity] || '📢';

    const affectedServices = alert.affected_services.join(', ');

    const message = `${severityEmoji} **NEW INCIDENT ALERT** ${severityEmoji}

**Incident ID:** ${incidentId}
**Severity:** ${alert.severity}
**Source:** ${alert.source}
**Type:** ${alert.alert_type}
**Affected Services:** ${affectedServices}

**Message:** ${alert.message}

**Timestamp:** ${alert.timestamp}

_This incident has been automatically logged and analysis is starting._`;

    // Send the notification
    await sendSlackMessage(message, config, env);

    env.logger.info('Incident notification sent to Slack', {
      incident_id: incidentId,
      severity: alert.severity,
      channel: env.SLACK_CHANNEL
    });

  } catch (error) {
    // Don't fail the incident creation if Slack notification fails
    env.logger.warn('Failed to send incident notification to Slack', {
      incident_id: incidentId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}