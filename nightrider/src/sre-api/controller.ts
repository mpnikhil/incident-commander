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

/**
 * Retry helper function for database operations
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  logger: any,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Database operation failed, attempt ${attempt}/${maxRetries}`, {
        error: lastError.message,
        attempt
      });

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Handles incoming incident alerts - Simple agent with SmartSQL storage
 */
export async function handleIncidentAlert(alert: IncidentAlert, env: Env): Promise<ProcessingResult> {
  env.logger.info('Processing incident alert', {
    source: alert.source,
    severity: alert.severity,
    alert_type: alert.alert_type,
    timestamp: alert.timestamp
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
    }, 3, env.logger);

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
    }, 3, env.logger);

    env.logger.info('Incident created and stored in database', { incident_id: incidentId });

    return {
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

  } catch (error) {
    env.logger.error('Failed to process incident alert', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw new ProcessingError(`Failed to process incident alert: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieves incident details from database - Simple agent, SQL storage
 */
export async function getIncidentDetails(id: string, env: Env): Promise<Incident> {
  env.logger.debug('Retrieving incident details', { incident_id: id });

  const result = await env.INCIDENTS_DATABASE.executeQuery({
    sqlQuery: `SELECT * FROM incidents WHERE id = '${id.replace(/'/g, "''")}'`
  });

  if (!result.results || result.results.length === 0) {
    throw new NotFoundError(`Incident ${id} not found`);
  }

  const row = result.results[0] as any;
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

  env.logger.info('Incident details retrieved from database', {
    incident_id: id,
    status: incident.status,
    severity: incident.severity
  });

  return incident;
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
  try {
    // Test database connection
    const result = await env.INCIDENTS_DATABASE.executeQuery({
      sqlQuery: 'SELECT COUNT(*) as count FROM incidents'
    });
    const incidentCount = (result.results?.[0] as any)?.count || 0;

    return {
      status: 'healthy',
      checks: {
        database_connection: true,
        incidents_table: result.results !== undefined,
        simple_agent: true
      },
      cache_size: incidentCount
    };
  } catch (error) {
    return {
      status: 'degraded',
      checks: {
        database_connection: false,
        incidents_table: false,
        simple_agent: true
      },
      cache_size: 0
    };
  }
}

/**
 * Lists all incidents from SQL database - Simple agent
 */
export async function listIncidents(env: Env): Promise<Incident[]> {
  env.logger.info('Retrieving incident list from database');

  const result = await env.INCIDENTS_DATABASE.executeQuery({
    sqlQuery: 'SELECT * FROM incidents ORDER BY created_at DESC'
  });

  if (!result.results) {
    return [];
  }

  // SmartSQL returns results as string, need to parse it
  let resultsArray: any[] = [];
  if (typeof result.results === 'string') {
    try {
      const parsed = JSON.parse(result.results);
      resultsArray = Array.isArray(parsed) ? parsed : (parsed.results || []);
    } catch (e) {
      env.logger.error('Failed to parse results', { results: result.results });
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

  env.logger.info(`Retrieved ${incidentList.length} incidents from database`);

  return incidentList;
}