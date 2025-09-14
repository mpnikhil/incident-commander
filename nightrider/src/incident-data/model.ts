/**
 * MODEL for incident-data Actor
 *
 * PRD REQUIREMENTS:
 * MODEL (data & business rules):
 * - DATA OPERATIONS: Store incident details, update status, retrieve history, validate state transitions
 * - BUSINESS RULES: Severity classification (P0/P1/P2/P3), escalation timeouts, autonomous action permissions
 * - FUNCTIONS TO EXPORT: createIncident, updateStatus, getIncidentHistory
 * - STATE REQUIREMENTS: Current incident state, timeline history, escalation status
 *
 * MUST IMPLEMENT:
 * 1. Incident data structure validation and constraints
 * 2. State transition validation logic
 * 3. Business rule enforcement for SRE operations
 * 4. Historical data correlation algorithms
 * 5. Escalation threshold calculations
 *
 * INTERFACES TO EXPORT:
 * - validateIncidentData(data: any): ValidationResult
 * - validateStateTransition(from: IncidentStatus, to: IncidentStatus): boolean
 * - calculateEscalationDeadline(incident: Incident): Date
 * - classifyIncidentSeverity(metadata: Record<string, any>): IncidentSeverity
 * - generateIncidentId(alert: IncidentAlert): string
 *
 * IMPORTS NEEDED:
 * - From shared types: Incident, IncidentStatus, IncidentSeverity, ValidationError, IncidentAlert
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - P0 incidents escalate after 5 minutes without resolution
 * - P1 incidents escalate after 15 minutes without resolution
 * - State transitions must follow: RECEIVED → INVESTIGATING → ANALYZING → REMEDIATING → RESOLVED
 * - Incident IDs format: "inc-{timestamp}-{random}"
 * - All incidents must have required fields: title, description, severity, source
 *
 * ERROR HANDLING:
 * - ValidationError for invalid data or state transitions
 * - BusinessRuleError for constraint violations
 *
 * INTEGRATION POINTS:
 * - Used by incident-data actor controller for data validation
 */

import {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  IncidentAlert,
  IncidentEvent,
  ValidationError,
  ValidationResult
} from '../types/shared.js';

// Business rule error for constraint violations
export class BusinessRuleError extends Error {
  constructor(message: string, public rule?: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

// Escalation thresholds in milliseconds
export const ESCALATION_THRESHOLDS = {
  [IncidentSeverity.P0]: 5 * 60 * 1000,  // 5 minutes
  [IncidentSeverity.P1]: 15 * 60 * 1000, // 15 minutes
  [IncidentSeverity.P2]: 60 * 60 * 1000, // 1 hour
  [IncidentSeverity.P3]: 4 * 60 * 60 * 1000 // 4 hours
};

// Valid state transition paths
const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.RECEIVED]: [IncidentStatus.INVESTIGATING, IncidentStatus.ESCALATED],
  [IncidentStatus.INVESTIGATING]: [IncidentStatus.ANALYZING, IncidentStatus.ESCALATED],
  [IncidentStatus.ANALYZING]: [IncidentStatus.REMEDIATING, IncidentStatus.ESCALATED],
  [IncidentStatus.REMEDIATING]: [IncidentStatus.RESOLVED, IncidentStatus.ESCALATED, IncidentStatus.INVESTIGATING],
  [IncidentStatus.RESOLVED]: [], // Terminal state
  [IncidentStatus.ESCALATED]: [IncidentStatus.INVESTIGATING] // Can return to investigation after escalation
};

/**
 * Validates incident data structure and required fields
 */
export function validateIncidentData(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!data) {
    errors.push('Incident data is required');
    return { valid: false, errors, warnings };
  }

  if (!data.source || typeof data.source !== 'string') {
    errors.push('Source is required and must be a string');
  }

  if (!data.message || typeof data.message !== 'string') {
    errors.push('Message is required and must be a string');
  }

  if (!data.alert_type || typeof data.alert_type !== 'string') {
    errors.push('Alert type is required and must be a string');
  }

  if (!data.severity || typeof data.severity !== 'string') {
    errors.push('Severity is required and must be a string');
  } else if (!Object.values(IncidentSeverity).includes(data.severity as IncidentSeverity)) {
    errors.push(`Invalid severity: ${data.severity}. Must be one of: ${Object.values(IncidentSeverity).join(', ')}`);
  }

  if (!data.timestamp || typeof data.timestamp !== 'string') {
    errors.push('Timestamp is required and must be a string');
  } else {
    const timestamp = new Date(data.timestamp);
    if (isNaN(timestamp.getTime())) {
      errors.push('Invalid timestamp format');
    }
  }

  if (!Array.isArray(data.affected_services)) {
    errors.push('Affected services must be an array');
  } else if (data.affected_services.length === 0) {
    warnings.push('No affected services specified');
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    warnings.push('Metadata should be provided for better incident analysis');
  }

  // Validate affected services are strings
  if (Array.isArray(data.affected_services)) {
    data.affected_services.forEach((service: any, index: number) => {
      if (typeof service !== 'string') {
        errors.push(`Affected service at index ${index} must be a string`);
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates state transitions according to business rules
 */
export function validateStateTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  const validNextStates = VALID_TRANSITIONS[from] || [];
  return validNextStates.includes(to);
}

/**
 * Calculates when an incident should be escalated based on severity and creation time
 */
export function calculateEscalationDeadline(incident: Incident): Date {
  const createdAt = new Date(incident.created_at);
  const threshold = ESCALATION_THRESHOLDS[incident.severity];
  return new Date(createdAt.getTime() + threshold);
}

/**
 * Determines if an incident requires escalation based on current time
 */
export function requiresEscalation(incident: Incident): boolean {
  if (incident.status === IncidentStatus.RESOLVED || incident.status === IncidentStatus.ESCALATED) {
    return false;
  }

  const deadline = calculateEscalationDeadline(incident);
  return new Date() > deadline;
}

/**
 * Classifies incident severity based on alert data and metadata
 */
export function classifyIncidentSeverity(alertData: IncidentAlert): IncidentSeverity {
  // Use the provided severity from alert if valid
  if (Object.values(IncidentSeverity).includes(alertData.severity as IncidentSeverity)) {
    return alertData.severity as IncidentSeverity;
  }

  // Auto-classify based on metadata and alert type
  const metadata = alertData.metadata || {};
  const alertType = alertData.alert_type?.toLowerCase() || '';

  // Critical service down indicators
  if (alertType.includes('down') || alertType.includes('outage') || alertType.includes('critical')) {
    return IncidentSeverity.P0;
  }

  // High impact indicators
  if (alertType.includes('error') || alertType.includes('failure') || metadata.error_rate > 50) {
    return IncidentSeverity.P1;
  }

  // Medium impact indicators
  if (alertType.includes('slow') || alertType.includes('degraded') || metadata.response_time > 1000) {
    return IncidentSeverity.P2;
  }

  // Default to P3 for other alerts
  return IncidentSeverity.P3;
}

/**
 * Generates unique incident ID following the required format: "inc-{timestamp}-{random}"
 */
export function generateIncidentId(alert: IncidentAlert): string {
  const timestamp = Date.now();
  const random = Math.random().toString(16).substring(2, 10);
  return `inc-${timestamp}-${random}`;
}

/**
 * Creates incident title from alert message with truncation if needed
 */
export function generateIncidentTitle(alert: IncidentAlert): string {
  const title = alert.message || 'Unknown incident';
  return title.length > 100 ? title.substring(0, 97) + '...' : title;
}

/**
 * Creates incident description from alert data
 */
export function generateIncidentDescription(alert: IncidentAlert): string {
  const parts = [
    `Alert Type: ${alert.alert_type}`,
    `Source: ${alert.source}`,
    `Affected Services: ${alert.affected_services.join(', ')}`,
    `Timestamp: ${alert.timestamp}`
  ];

  if (alert.metadata && Object.keys(alert.metadata).length > 0) {
    parts.push(`Metadata: ${JSON.stringify(alert.metadata, null, 2)}`);
  }

  return parts.join('\n');
}

/**
 * Creates a new incident from alert data
 */
export function createIncidentFromAlert(alert: IncidentAlert): Incident {
  const validationResult = validateIncidentData(alert);
  if (!validationResult.valid) {
    throw new ValidationError(`Invalid incident data: ${validationResult.errors.join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateIncidentId(alert);
  const severity = classifyIncidentSeverity(alert);

  return {
    id,
    title: generateIncidentTitle(alert),
    description: generateIncidentDescription(alert),
    severity,
    status: IncidentStatus.RECEIVED,
    source: alert.source,
    affected_services: [...alert.affected_services], // Create a copy
    created_at: now,
    updated_at: now,
    metadata: { ...alert.metadata } // Create a copy
  };
}

/**
 * Creates a timeline event for incident tracking
 */
export function createTimelineEvent(incidentId: string, event: string, metadata?: Record<string, any>): IncidentEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`,
    incident_id: incidentId,
    event,
    timestamp: new Date().toISOString(),
    metadata: metadata ? { ...metadata } : undefined
  };
}

/**
 * Validates incident updates and ensures data integrity
 */
export function validateIncidentUpdate(updates: Partial<Incident>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate fields if they are being updated
  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
      errors.push('Title must be a non-empty string');
    }
  }

  if (updates.description !== undefined) {
    if (typeof updates.description !== 'string') {
      errors.push('Description must be a string');
    }
  }

  if (updates.severity !== undefined) {
    if (!Object.values(IncidentSeverity).includes(updates.severity)) {
      errors.push(`Invalid severity: ${updates.severity}`);
    }
  }

  if (updates.affected_services !== undefined) {
    if (!Array.isArray(updates.affected_services)) {
      errors.push('Affected services must be an array');
    } else {
      updates.affected_services.forEach((service, index) => {
        if (typeof service !== 'string') {
          errors.push(`Affected service at index ${index} must be a string`);
        }
      });
    }
  }

  // Protected fields that shouldn't be updated directly
  if (updates.id !== undefined) {
    errors.push('ID cannot be updated');
  }

  if (updates.created_at !== undefined) {
    errors.push('Created timestamp cannot be updated');
  }

  return { valid: errors.length === 0, errors, warnings };
}