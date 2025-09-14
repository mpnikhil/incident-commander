/**
 * CONTROLLER for incident-data Actor
 *
 * PRD REQUIREMENTS:
 * MODEL (data & business rules) - Actor managing incident state and history
 * - createIncident(data: IncidentData): Promise<Incident>
 * - updateStatus(id: string, status: IncidentStatus): Promise<void>
 * - getIncidentHistory(id: string): Promise<IncidentEvent[]>
 * - STATE REQUIREMENTS: Current incident state, timeline history, escalation status
 *
 * MUST IMPLEMENT:
 * 1. Incident CRUD operations with state persistence
 * 2. Timeline event tracking and history management
 * 3. State transition orchestration with validation
 * 4. Cross-incident correlation and pattern detection
 * 5. Automatic escalation monitoring
 *
 * INTERFACES TO EXPORT:
 * - createIncident(alert: IncidentAlert): Promise<Incident>
 * - updateIncidentStatus(id: string, status: IncidentStatus): Promise<void>
 * - getIncident(id: string): Promise<Incident>
 * - getIncidentHistory(id: string): Promise<IncidentEvent[]>
 * - addTimelineEvent(id: string, event: string): Promise<void>
 * - checkEscalationThresholds(): Promise<Incident[]>
 *
 * IMPORTS NEEDED:
 * - From shared types: Incident, IncidentAlert, IncidentStatus, IncidentEvent, ValidationError
 * - From env: this.env.state (actor state), env.METRICS_DATABASE, env.logger
 * - From other layers: model functions for validation and business rules
 *
 * BUSINESS RULES:
 * - Store all incident data in actor persistent state
 * - Track complete timeline of all status changes
 * - Enforce state transition validation rules
 * - Monitor escalation thresholds automatically
 * - Correlate related incidents by service/pattern
 *
 * ERROR HANDLING:
 * - ValidationError for invalid incident data
 * - NotFoundError for missing incidents
 * - StateTransitionError for invalid status changes
 * - Log all state changes with full context
 *
 * INTEGRATION POINTS:
 * - Called by sre-api and incident-orchestrator for data operations
 * - Stores historical metrics in SmartSQL database
 * - Provides incident correlation data for analysis
 */

import {
  Incident,
  IncidentAlert,
  IncidentStatus,
  IncidentEvent,
  ValidationError,
  NotFoundError
} from '../types/shared.js';

import {
  createIncidentFromAlert,
  validateStateTransition,
  createTimelineEvent,
  requiresEscalation,
  validateIncidentUpdate,
  BusinessRuleError
} from './model.js';

// Controller interface for incident operations
export interface IncidentController {
  createIncident(alert: IncidentAlert): Promise<Incident>;
  getIncident(id: string): Promise<Incident | null>;
  updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null>;
  updateIncidentStatus(id: string, status: IncidentStatus): Promise<void>;
  listIncidents(): Promise<Incident[]>;
  getIncidentHistory(id: string): Promise<IncidentEvent[]>;
  addTimelineEvent(id: string, event: string, metadata?: Record<string, any>): Promise<void>;
  checkEscalationThresholds(): Promise<Incident[]>;
}

// State transition error for invalid status changes
export class StateTransitionError extends Error {
  constructor(message: string, public from?: IncidentStatus, public to?: IncidentStatus) {
    super(message);
    this.name = 'StateTransitionError';
  }
}

/**
 * Storage interface for incident data and timeline events
 */
export interface IncidentStorage {
  incidents: Record<string, Incident>;
  timelines: Record<string, IncidentEvent[]>;
}

/**
 * Creates incident from alert with full validation and business logic
 */
export async function createIncident(
  alert: IncidentAlert,
  storage: IncidentStorage,
  logger?: any
): Promise<Incident> {
  try {
    // Validate and create incident using model layer
    const incident = createIncidentFromAlert(alert);

    // Store in persistent state
    storage.incidents[incident.id] = incident;

    // Initialize timeline for the incident
    storage.timelines[incident.id] = [];

    // Add creation event to timeline
    const creationEvent = createTimelineEvent(
      incident.id,
      'Incident created',
      { source: alert.source, alert_type: alert.alert_type }
    );
    storage.timelines[incident.id]?.push(creationEvent);

    if (logger) {
      logger.info('Incident created successfully', {
        incident_id: incident.id,
        severity: incident.severity,
        source: incident.source,
        affected_services: incident.affected_services
      });
    }

    return incident;
  } catch (error) {
    if (logger) {
      logger.error('Failed to create incident', {
        error: error instanceof Error ? error.message : String(error),
        alert: alert
      });
    }
    throw error;
  }
}

/**
 * Retrieves incident by ID from storage
 */
export async function getIncident(
  id: string,
  storage: IncidentStorage,
  logger?: any
): Promise<Incident | null> {
  const incident = storage.incidents[id] || null;

  if (logger && incident) {
    logger.debug('Incident retrieved', { incident_id: id });
  }

  return incident;
}

/**
 * Updates incident with validation and timeline tracking
 */
export async function updateIncident(
  id: string,
  updates: Partial<Incident>,
  storage: IncidentStorage,
  logger?: any
): Promise<Incident | null> {
  const existingIncident = storage.incidents[id];
  if (!existingIncident) {
    return null;
  }

  // Validate updates
  const validationResult = validateIncidentUpdate(updates);
  if (!validationResult.valid) {
    throw new ValidationError(`Invalid update data: ${validationResult.errors.join(', ')}`);
  }

  try {
    // Apply updates
    const updatedIncident: Incident = {
      ...existingIncident,
      ...updates,
      updated_at: new Date().toISOString()
    };

    storage.incidents[id] = updatedIncident;

    // Add timeline event for update
    const updateEvent = createTimelineEvent(
      id,
      'Incident updated',
      { updated_fields: Object.keys(updates) }
    );

    if (!storage.timelines[id]) {
      storage.timelines[id] = [];
    }
    storage.timelines[id].push(updateEvent);

    if (logger) {
      logger.info('Incident updated', {
        incident_id: id,
        updated_fields: Object.keys(updates)
      });
    }

    return updatedIncident;
  } catch (error) {
    if (logger) {
      logger.error('Failed to update incident', {
        incident_id: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    throw error;
  }
}

/**
 * Updates incident status with state transition validation
 */
export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  storage: IncidentStorage,
  logger?: any
): Promise<void> {
  const incident = storage.incidents[id];
  if (!incident) {
    throw new NotFoundError(`Incident not found: ${id}`);
  }

  // Validate state transition
  if (!validateStateTransition(incident.status, status)) {
    throw new StateTransitionError(
      `Invalid state transition from ${incident.status} to ${status}`,
      incident.status,
      status
    );
  }

  try {
    // Update status and timestamp
    incident.status = status;
    incident.updated_at = new Date().toISOString();
    storage.incidents[id] = incident;

    // Add timeline event for status change
    const statusEvent = createTimelineEvent(
      id,
      `Status changed to ${status}`,
      { previous_status: incident.status, new_status: status }
    );

    if (!storage.timelines[id]) {
      storage.timelines[id] = [];
    }
    storage.timelines[id].push(statusEvent);

    if (logger) {
      logger.info('Incident status updated', {
        incident_id: id,
        previous_status: incident.status,
        new_status: status
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Failed to update incident status', {
        incident_id: id,
        status: status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    throw error;
  }
}

/**
 * Lists all incidents from storage
 */
export async function listIncidents(
  storage: IncidentStorage,
  logger?: any
): Promise<Incident[]> {
  const incidents = Object.values(storage.incidents || {});

  if (logger) {
    logger.debug('Listed incidents', { count: incidents.length });
  }

  return incidents;
}

/**
 * Retrieves complete timeline history for an incident
 */
export async function getIncidentHistory(
  id: string,
  storage: IncidentStorage,
  logger?: any
): Promise<IncidentEvent[]> {
  const timeline = storage.timelines[id] || [];

  if (logger) {
    logger.debug('Retrieved incident history', {
      incident_id: id,
      event_count: timeline.length
    });
  }

  // Return sorted by timestamp
  return timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Adds a custom timeline event to an incident
 */
export async function addTimelineEvent(
  id: string,
  event: string,
  storage: IncidentStorage,
  metadata?: Record<string, any>,
  logger?: any
): Promise<void> {
  const incident = storage.incidents[id];
  if (!incident) {
    throw new NotFoundError(`Incident not found: ${id}`);
  }

  try {
    // Create timeline event
    const timelineEvent = createTimelineEvent(id, event, metadata);

    // Initialize timeline if not exists
    if (!storage.timelines[id]) {
      storage.timelines[id] = [];
    }

    storage.timelines[id].push(timelineEvent);

    if (logger) {
      logger.info('Timeline event added', {
        incident_id: id,
        event: event
      });
    }
  } catch (error) {
    if (logger) {
      logger.error('Failed to add timeline event', {
        incident_id: id,
        event: event,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    throw error;
  }
}

/**
 * Checks all incidents for escalation thresholds and returns those requiring escalation
 */
export async function checkEscalationThresholds(
  storage: IncidentStorage,
  logger?: any
): Promise<Incident[]> {
  const incidents = Object.values(storage.incidents || {});
  const escalationCandidates: Incident[] = [];

  for (const incident of incidents) {
    try {
      if (requiresEscalation(incident)) {
        escalationCandidates.push(incident);

        if (logger) {
          logger.warn('Incident requires escalation', {
            incident_id: incident.id,
            severity: incident.severity,
            created_at: incident.created_at,
            current_status: incident.status
          });
        }
      }
    } catch (error) {
      if (logger) {
        logger.error('Error checking escalation for incident', {
          incident_id: incident.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (logger) {
    logger.info('Escalation check completed', {
      total_incidents: incidents.length,
      requiring_escalation: escalationCandidates.length
    });
  }

  return escalationCandidates;
}

/**
 * Correlates incidents by service and patterns for analysis
 */
export async function correlateIncidents(
  storage: IncidentStorage,
  logger?: any
): Promise<Record<string, Incident[]>> {
  const incidents = Object.values(storage.incidents || {});
  const correlations: Record<string, Incident[]> = {};

  // Group by affected services
  for (const incident of incidents) {
    for (const service of incident.affected_services) {
      if (!correlations[service]) {
        correlations[service] = [];
      }
      correlations[service].push(incident);
    }
  }

  if (logger) {
    logger.debug('Incident correlation completed', {
      total_incidents: incidents.length,
      services_affected: Object.keys(correlations).length
    });
  }

  return correlations;
}

/**
 * Gets incidents by status for monitoring and reporting
 */
export async function getIncidentsByStatus(
  status: IncidentStatus,
  storage: IncidentStorage,
  logger?: any
): Promise<Incident[]> {
  const incidents = Object.values(storage.incidents || {});
  const filteredIncidents = incidents.filter(incident => incident.status === status);

  if (logger) {
    logger.debug('Retrieved incidents by status', {
      status: status,
      count: filteredIncidents.length
    });
  }

  return filteredIncidents;
}

/**
 * Searches incidents by criteria for analysis
 */
export async function searchIncidents(
  criteria: {
    severity?: string;
    source?: string;
    affected_service?: string;
    created_after?: string;
    created_before?: string;
  },
  storage: IncidentStorage,
  logger?: any
): Promise<Incident[]> {
  const incidents = Object.values(storage.incidents || {});
  const results = incidents.filter(incident => {
    // Filter by severity
    if (criteria.severity && incident.severity !== criteria.severity) {
      return false;
    }

    // Filter by source
    if (criteria.source && incident.source !== criteria.source) {
      return false;
    }

    // Filter by affected service
    if (criteria.affected_service && !incident.affected_services.includes(criteria.affected_service)) {
      return false;
    }

    // Filter by creation date range
    if (criteria.created_after) {
      const createdAt = new Date(incident.created_at);
      const afterDate = new Date(criteria.created_after);
      if (createdAt < afterDate) {
        return false;
      }
    }

    if (criteria.created_before) {
      const createdAt = new Date(incident.created_at);
      const beforeDate = new Date(criteria.created_before);
      if (createdAt > beforeDate) {
        return false;
      }
    }

    return true;
  });

  if (logger) {
    logger.debug('Incident search completed', {
      criteria: criteria,
      results_count: results.length
    });
  }

  return results;
}