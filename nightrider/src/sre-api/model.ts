/**
 * MODEL for sre-api Service
 *
 * PRD REQUIREMENTS:
 * VIEW (interface handling):
 * - ENDPOINTS: POST /api/incidents/alert, GET /incidents/{id}, GET /incidents/{id}/analysis, POST /incidents/{id}/remediate
 * - INPUT VALIDATION: Incident ID format, severity enum validation, timestamp validation
 * - RESPONSE FORMAT: JSON with incident data, RCA results, action summaries
 * - ERROR HANDLING: 400 for validation errors, 404 for not found, 500 for processing errors
 *
 * MUST IMPLEMENT:
 * 1. Input validation for all API endpoints
 * 2. Request data sanitization and format checking
 * 3. Response data formatting and serialization
 * 4. Error response structures
 *
 * INTERFACES TO EXPORT:
 * - validateIncidentAlert(alert: IncidentAlert): ValidationResult
 * - validateIncidentId(id: string): boolean
 * - formatIncidentResponse(incident: Incident): IncidentResponse
 * - formatRCAResponse(rca: RCAResult): object
 * - formatErrorResponse(error: Error): ErrorResponse
 *
 * IMPORTS NEEDED:
 * - From shared types: IncidentAlert, Incident, RCAResult, ValidationError, NotFoundError
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - Incident ID must be alphanumeric with hyphens
 * - Severity must be P0, P1, P2, or P3
 * - Timestamps must be ISO 8601 format
 * - Required fields: source, alert_type, severity, message
 *
 * ERROR HANDLING:
 * - ValidationError for invalid input data
 * - Return structured error responses with field-level details
 *
 * INTEGRATION POINTS:
 * - Used by sre-api controller for request/response validation
 */

import {
  IncidentAlert,
  Incident,
  RCAResult,
  IncidentResponse,
  ValidationError,
  NotFoundError,
  ProcessingError,
  IncidentSeverity
} from '../types/shared';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Error response interface
export interface ErrorResponse {
  error: boolean;
  message: string;
  details?: string[];
  timestamp: string;
}

// Remediation result interface
export interface RemediationResult {
  incident_id: string;
  actions_executed: string[];
  results: string[];
  status: string;
}

/**
 * Validates an incident alert for required fields and format
 */
export function validateIncidentAlert(alert: IncidentAlert): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!alert.source) {
    errors.push('Source is required');
  }

  if (!alert.alert_type) {
    errors.push('Alert type is required');
  }

  if (!alert.severity) {
    errors.push('Severity is required');
  } else if (!['P0', 'P1', 'P2', 'P3'].includes(alert.severity)) {
    errors.push('Invalid severity: must be P0, P1, P2, or P3');
  }

  if (!alert.message) {
    errors.push('Message is required');
  }

  if (!alert.timestamp) {
    errors.push('Timestamp is required');
  } else if (!isValidISO8601(alert.timestamp)) {
    errors.push('Timestamp must be in ISO 8601 format');
  }

  if (!alert.affected_services || !Array.isArray(alert.affected_services)) {
    errors.push('Affected services must be an array');
  }

  if (!alert.metadata || typeof alert.metadata !== 'object') {
    errors.push('Metadata must be an object');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates an incident ID format
 */
export function validateIncidentId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Must be alphanumeric with hyphens and underscores only
  const regex = /^[a-zA-Z0-9\-_]+$/;
  return regex.test(id) && id.length > 0;
}

/**
 * Formats an incident for API response
 */
export function formatIncidentResponse(incident: Incident): IncidentResponse {
  return {
    incident_id: incident.id,
    agent_status: getAgentStatusFromIncidentStatus(incident.status),
    initial_assessment: generateInitialAssessment(incident),
    estimated_analysis_time: calculateEstimatedAnalysisTime(incident.severity)
  };
}

/**
 * Formats RCA results for API response
 */
export function formatRCAResponse(rca: RCAResult): object {
  return {
    incident_id: rca.incident_id,
    root_cause: rca.root_cause,
    evidence: rca.evidence,
    confidence_score: rca.confidence_score,
    contributing_factors: rca.contributing_factors,
    recommended_actions: rca.recommended_actions.map(action => ({
      action_type: action.action_type,
      description: action.description,
      risk_level: action.risk_level,
      target: action.target,
      params: action.params || {},
      estimated_impact: action.estimated_impact
    })),
    analysis_timeline: rca.analysis_timeline,
    prevention_strategies: rca.prevention_strategies,
    generated_at: new Date().toISOString()
  };
}

/**
 * Formats error response with structured information
 */
export function formatErrorResponse(error: Error): ErrorResponse {
  const response: ErrorResponse = {
    error: true,
    message: error.message,
    timestamp: new Date().toISOString()
  };

  if (error instanceof ValidationError) {
    response.details = [error.field || 'validation_error'];
  }

  return response;
}

/**
 * Formats remediation result for API response
 */
export function formatRemediationResponse(result: RemediationResult): object {
  return {
    incident_id: result.incident_id,
    actions_executed: result.actions_executed,
    results: result.results,
    status: result.status,
    completed_at: new Date().toISOString()
  };
}

/**
 * Sanitizes input data to prevent injection attacks
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input.replace(/[<>'"&]/g, '');
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Validates JSON payload structure
 */
export function validateJSONPayload(payload: any, requiredFields: string[]): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a valid JSON object');
    return { isValid: false, errors };
  }

  for (const field of requiredFields) {
    if (!(field in payload) || payload[field] === null || payload[field] === undefined) {
      errors.push(`Required field missing: ${field}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper functions

/**
 * Validates ISO 8601 timestamp format
 */
function isValidISO8601(timestamp: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!iso8601Regex.test(timestamp)) {
    return false;
  }

  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

/**
 * Maps incident status to agent status
 */
function getAgentStatusFromIncidentStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'received': 'Alert received - Starting initial assessment',
    'investigating': 'Gathering data and analyzing root cause',
    'analyzing': 'Performing deep analysis and impact assessment',
    'remediating': 'Executing remediation actions',
    'resolved': 'Incident resolved - Monitoring for stability',
    'escalated': 'Escalated to human operators'
  };

  return statusMap[status] || 'Processing incident';
}

/**
 * Generates initial assessment based on incident data
 */
function generateInitialAssessment(incident: Incident): string {
  const severity = incident.severity;
  const affectedServices = incident.affected_services.join(', ');

  const assessmentMap: Record<string, string> = {
    'P0': `CRITICAL: Service outage detected affecting ${affectedServices}. Immediate investigation required.`,
    'P1': `HIGH: Major functionality impacted for ${affectedServices}. Prioritizing analysis.`,
    'P2': `MEDIUM: Minor functionality issues detected for ${affectedServices}. Investigating impact.`,
    'P3': `LOW: Minimal impact incident for ${affectedServices}. Standard investigation procedures.`
  };

  return assessmentMap[severity] || `Incident detected affecting ${affectedServices}. Analyzing impact.`;
}

/**
 * Calculates estimated analysis time based on severity
 */
function calculateEstimatedAnalysisTime(severity: string): string {
  const timeMap: Record<string, string> = {
    'P0': '2-5 minutes',
    'P1': '5-10 minutes',
    'P2': '10-15 minutes',
    'P3': '15-30 minutes'
  };

  return timeMap[severity] || '5-15 minutes';
}