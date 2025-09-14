/**
 * MODEL for incident-orchestrator Service
 *
 * PRD REQUIREMENTS:
 * CONTROLLER (orchestration):
 * - WORKFLOWS: Agent receives alert → Agent assesses → Agent gathers data via MCP → Agent analyzes → Agent decides/executes
 * - INTEGRATIONS: External observability APIs, email service, knowledge base search
 * - MODEL-VIEW COORDINATION: Coordinates between API requests and data storage
 * - ERROR RECOVERY: Retry failed API calls, fallback to cached data, escalate on repeated failures
 *
 * MUST IMPLEMENT:
 * 1. Workflow state management and validation
 * 2. Business rules for incident processing stages
 * 3. Data validation for workflow transitions
 * 4. Risk assessment calculations
 * 5. Escalation threshold enforcement
 *
 * INTERFACES TO EXPORT:
 * - validateWorkflowState(currentState: string, newState: string): boolean
 * - calculateRiskLevel(action: RecommendedAction): ActionRiskLevel
 * - shouldEscalate(incident: Incident, timeElapsed: number): boolean
 * - validateIncidentData(incident: Incident): ValidationResult
 * - formatProcessingResult(result: any): ProcessingResult
 *
 * IMPORTS NEEDED:
 * - From shared types: Incident, ProcessingResult, RecommendedAction, ActionRiskLevel, ValidationError
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - P0 incidents must be processed within 2 minutes
 * - P1 incidents must be processed within 5 minutes
 * - Autonomous actions only allowed for low-risk operations
 * - Escalation required after 3 failed analysis attempts
 *
 * ERROR HANDLING:
 * - ValidationError for invalid workflow states
 * - ProcessingError for business rule violations
 *
 * INTEGRATION POINTS:
 * - Used by incident-orchestrator controller for workflow management
 */

import {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  ProcessingResult,
  RecommendedAction,
  ActionRiskLevel,
  ValidationError,
  ProcessingError,
  RCAResult
} from '../types/shared';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ProcessingTimeResult {
  withinLimits: boolean;
  escalationRequired: boolean;
}

export interface WorkflowResult {
  workflow_completed: boolean;
  status: string;
  actions_taken: string[];
  timeline: string[];
}

// Valid workflow state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  [IncidentStatus.RECEIVED]: [
    IncidentStatus.INVESTIGATING,
    IncidentStatus.ESCALATED
  ],
  [IncidentStatus.INVESTIGATING]: [
    IncidentStatus.ANALYZING,
    IncidentStatus.ESCALATED,
    IncidentStatus.INVESTIGATING // Allow staying in same state
  ],
  [IncidentStatus.ANALYZING]: [
    IncidentStatus.REMEDIATING,
    IncidentStatus.ESCALATED,
    IncidentStatus.ANALYZING // Allow staying in same state
  ],
  [IncidentStatus.REMEDIATING]: [
    IncidentStatus.RESOLVED,
    IncidentStatus.ESCALATED,
    IncidentStatus.REMEDIATING // Allow staying in same state
  ],
  [IncidentStatus.RESOLVED]: [
    IncidentStatus.RESOLVED // Only allow staying resolved
  ],
  [IncidentStatus.ESCALATED]: [
    IncidentStatus.ESCALATED // Only allow staying escalated
  ]
};

// Processing time limits in milliseconds
const PROCESSING_TIME_LIMITS: Record<IncidentSeverity, number> = {
  [IncidentSeverity.P0]: 2 * 60 * 1000, // 2 minutes
  [IncidentSeverity.P1]: 5 * 60 * 1000, // 5 minutes
  [IncidentSeverity.P2]: 15 * 60 * 1000, // 15 minutes
  [IncidentSeverity.P3]: 30 * 60 * 1000  // 30 minutes
};

// High-risk action patterns
const HIGH_RISK_ACTIONS = ['delete', 'drop', 'destroy', 'terminate', 'kill'];
const HIGH_RISK_TARGETS = ['prod', 'production', 'live'];

/**
 * Validates workflow state transitions
 */
export function validateWorkflowState(currentState: string, newState: string): boolean {
  if (!Object.values(IncidentStatus).includes(currentState as IncidentStatus)) {
    throw new ValidationError(`Invalid current state: ${currentState}`);
  }

  if (!Object.values(IncidentStatus).includes(newState as IncidentStatus)) {
    throw new ValidationError(`Invalid new state: ${newState}`);
  }

  const allowedTransitions = VALID_TRANSITIONS[currentState] || [];
  return allowedTransitions.includes(newState);
}

/**
 * Calculates risk level for recommended actions
 */
export function calculateRiskLevel(action: RecommendedAction): ActionRiskLevel {
  // Check if action type is high-risk
  const isHighRiskAction = HIGH_RISK_ACTIONS.some(riskAction =>
    action.action_type.toLowerCase().includes(riskAction)
  );

  // Check if target is production
  const isProductionTarget = HIGH_RISK_TARGETS.some(riskTarget =>
    action.target.toLowerCase().includes(riskTarget)
  );

  // Any high-risk action or production target requires approval
  if (isHighRiskAction || isProductionTarget) {
    return ActionRiskLevel.REQUIRES_APPROVAL;
  }

  // If already specified, respect the existing risk level
  if (action.risk_level) {
    return action.risk_level;
  }

  // Default to autonomous safe for simple actions
  return ActionRiskLevel.AUTONOMOUS_SAFE;
}

/**
 * Determines if incident should be escalated based on time and failed attempts
 */
export function shouldEscalate(incident: Incident, timeElapsed: number): boolean {
  // Check for failed attempts regardless of time
  const failedAttempts = incident.metadata?.failed_attempts || 0;
  if (failedAttempts >= 3) {
    return true;
  }

  // Check time-based escalation for P0 and P1
  const timeLimit = PROCESSING_TIME_LIMITS[incident.severity];
  if (timeLimit && timeElapsed > timeLimit) {
    return incident.severity === IncidentSeverity.P0 || incident.severity === IncidentSeverity.P1;
  }

  return false;
}

/**
 * Validates incident data completeness and format
 */
export function validateIncidentData(incident: Incident): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!incident.id || incident.id.trim() === '') {
    errors.push('id is required');
  }

  if (!incident.title || incident.title.trim() === '') {
    errors.push('title is required');
  }

  if (!incident.description || incident.description.trim() === '') {
    errors.push('description is required');
  }

  if (!incident.source || incident.source.trim() === '') {
    errors.push('source is required');
  }

  // Validate severity
  if (!Object.values(IncidentSeverity).includes(incident.severity)) {
    errors.push('severity must be one of: P0, P1, P2, P3');
  }

  // Validate status
  if (!Object.values(IncidentStatus).includes(incident.status)) {
    errors.push('status must be a valid incident status');
  }

  // Validate affected services
  if (!incident.affected_services || incident.affected_services.length === 0) {
    errors.push('at least one affected service is required');
  }

  // Validate timestamp format - more lenient, just check if it's a valid date
  if (incident.created_at) {
    const createdDate = new Date(incident.created_at);
    if (isNaN(createdDate.getTime())) {
      errors.push('created_at must be valid ISO 8601 date');
    }
  }

  if (incident.updated_at) {
    const updatedDate = new Date(incident.updated_at);
    if (isNaN(updatedDate.getTime())) {
      errors.push('updated_at must be valid ISO 8601 date');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Formats raw processing result into standardized format
 */
export function formatProcessingResult(result: any): ProcessingResult {
  // Validate status
  const validStatuses = ['completed', 'in_progress', 'failed', 'escalated'];
  if (!validStatuses.includes(result.status)) {
    throw new ProcessingError(`Invalid processing status: ${result.status}`);
  }

  return {
    status: result.status,
    agent_analysis: result.analysis || result.agent_analysis || {
      incident_id: '',
      root_cause: 'Analysis pending',
      evidence: [],
      confidence_score: 0,
      contributing_factors: [],
      recommended_actions: [],
      analysis_timeline: [],
      prevention_strategies: []
    } as RCAResult,
    actions_taken: result.actions || result.actions_taken || [],
    timeline: result.timeline || []
  };
}

/**
 * Validates processing time against business rules
 */
export function validateProcessingTime(incident: Incident, timeElapsed: number): ProcessingTimeResult {
  const timeLimit = PROCESSING_TIME_LIMITS[incident.severity];
  const withinLimits = timeElapsed <= timeLimit;

  // Escalation required for P0/P1 incidents that exceed time limits
  const escalationRequired = !withinLimits &&
    (incident.severity === IncidentSeverity.P0 || incident.severity === IncidentSeverity.P1);

  return {
    withinLimits,
    escalationRequired
  };
}

/**
 * Checks if action can be executed autonomously
 */
export function canExecuteAutonomously(action: RecommendedAction): boolean {
  return action.risk_level === ActionRiskLevel.AUTONOMOUS_SAFE;
}

/**
 * Enforces business rules for actions
 */
export function enforceBusinessRules(action: RecommendedAction): void {
  // Prevent destructive actions on production
  const isDestructive = HIGH_RISK_ACTIONS.some(riskAction =>
    action.action_type.toLowerCase().includes(riskAction)
  );

  const isProduction = HIGH_RISK_TARGETS.some(target =>
    action.target.toLowerCase().includes(target)
  );

  if (isDestructive && isProduction) {
    throw new ProcessingError(
      `Destructive action '${action.action_type}' not allowed on production target '${action.target}'`
    );
  }
}