/**
 * MODEL for remediation-coordinator Service
 *
 * PRD REQUIREMENTS:
 * CONTROLLER (orchestration):
 * - Manages remediation actions
 * - Coordinates workflow orchestration
 * - Error handling and retry logic
 * - Model-View coordination
 *
 * MUST IMPLEMENT:
 * 1. Remediation action validation and risk assessment
 * 2. Execution authorization rules
 * 3. Action result verification logic
 * 4. Rollback strategy definition
 * 5. Success criteria validation
 *
 * INTERFACES TO EXPORT:
 * - validateRemediationAction(action: RecommendedAction): ValidationResult
 * - assessExecutionRisk(action: RecommendedAction, context: Incident): RiskAssessment
 * - defineRollbackStrategy(action: RecommendedAction): RollbackPlan
 * - validateActionResult(result: any, expected: any): boolean
 * - formatExecutionReport(action: RecommendedAction, result: any): ExecutionReport
 *
 * IMPORTS NEEDED:
 * - From shared types: RecommendedAction, Incident, ActionRiskLevel, ValidationError
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - Only AUTONOMOUS_SAFE actions can be executed without approval
 * - Restart actions limited to 3 attempts per incident
 * - DB operations require manual approval always
 * - All actions must have defined rollback procedures
 * - Success verification required within 60 seconds
 *
 * ERROR HANDLING:
 * - ValidationError for unauthorized actions
 * - ProcessingError for execution failures
 * - Risk assessment failures block execution
 *
 * INTEGRATION POINTS:
 * - Used by remediation-coordinator controller for action validation
 */

import {
  RecommendedAction,
  Incident,
  ActionRiskLevel,
  ValidationError,
  ProcessingError,
  ValidationResult,
  RiskAssessment,
  RollbackPlan,
  ExecutionReport,
  ExecutionResult
} from '../types/shared';

/**
 * Validates a remediation action before execution
 * Business Rules:
 * - Action type must be specified
 * - Target must be specified
 * - Risk level must be valid
 * - Description must be provided
 */
export function validateRemediationAction(action: RecommendedAction): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field validation
  if (!action.action_type || action.action_type.trim() === '') {
    errors.push('Action type is required');
  }

  if (!action.target || action.target.trim() === '') {
    errors.push('Target is required');
  }

  if (!action.description || action.description.trim() === '') {
    errors.push('Description is required');
  }

  if (!action.risk_level || !Object.values(ActionRiskLevel).includes(action.risk_level)) {
    errors.push('Valid risk level is required');
  }

  if (!action.estimated_impact || action.estimated_impact.trim() === '') {
    warnings.push('Estimated impact should be provided');
  }

  // Action-specific validation
  if (action.action_type === 'restart_service') {
    if (!action.target.includes('service')) {
      warnings.push('Restart action target should reference a service');
    }
  }

  if (action.action_type === 'scale_resources') {
    if (!action.params?.replicas && !action.params?.cpu && !action.params?.memory) {
      errors.push('Scale action must specify replicas, cpu, or memory parameters');
    }
  }

  if (action.action_type === 'database_operation') {
    if (!action.params?.query && !action.params?.migration) {
      errors.push('Database operation must specify query or migration');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Assesses execution risk for an action within incident context
 * Business Rules:
 * - DB operations always require approval
 * - High-impact actions require approval
 * - Restart actions after 3 attempts require approval
 * - P0 incidents allow more autonomous actions
 */
export function assessExecutionRisk(action: RecommendedAction, context: Incident): RiskAssessment {
  const riskFactors: string[] = [];
  const mitigationSteps: string[] = [];
  let requiresApproval = false;
  let riskLevel = action.risk_level;

  // Check restart attempt limits
  if (action.action_type === 'restart_service') {
    const restartAttempts = context.metadata?.restart_attempts || 0;
    if (restartAttempts >= 3) {
      riskFactors.push('Restart limit exceeded (3 attempts)');
      riskLevel = ActionRiskLevel.REQUIRES_APPROVAL;
      requiresApproval = true;
    } else {
      mitigationSteps.push('Monitor service health after restart');
    }
  }

  // Database operations always require approval
  if (action.action_type.includes('database') || action.action_type.includes('db')) {
    riskFactors.push('Database operations require approval');
    riskLevel = ActionRiskLevel.REQUIRES_APPROVAL;
    requiresApproval = true;
    mitigationSteps.push('Backup database before operation');
    mitigationSteps.push('Verify operation in staging environment');
  }

  // Scale operations assessment
  if (action.action_type === 'scale_resources') {
    const replicas = action.params?.replicas || 1;
    if (replicas > 10) {
      riskFactors.push('Large scale operation (>10 replicas)');
      requiresApproval = true;
      riskLevel = ActionRiskLevel.REQUIRES_APPROVAL;
    }
    mitigationSteps.push('Monitor resource utilization');
    mitigationSteps.push('Set up alerts for scaling events');
  }

  // Network operations
  if (action.action_type.includes('network') || action.action_type.includes('firewall')) {
    riskFactors.push('Network changes can affect multiple services');
    requiresApproval = true;
    riskLevel = ActionRiskLevel.REQUIRES_APPROVAL;
    mitigationSteps.push('Test connectivity after changes');
  }

  // Configuration changes
  if (action.action_type.includes('config') || action.action_type.includes('setting')) {
    riskFactors.push('Configuration changes may require service restart');
    mitigationSteps.push('Backup current configuration');
    mitigationSteps.push('Validate configuration before applying');
  }

  // Severity-based risk adjustment
  if (context.severity === 'P0' && action.risk_level === ActionRiskLevel.AUTONOMOUS_SAFE) {
    mitigationSteps.push('P0 incident - expedited autonomous execution approved');
  } else if (context.severity === 'P3' || context.severity === 'P2') {
    if (!requiresApproval) {
      mitigationSteps.push('Lower severity incident - standard validation applied');
    }
  }

  return {
    risk_level: riskLevel,
    risk_factors: riskFactors,
    mitigation_steps: mitigationSteps,
    requires_approval: requiresApproval || riskLevel === ActionRiskLevel.REQUIRES_APPROVAL
  };
}

/**
 * Defines rollback strategy for an action
 * Business Rules:
 * - All actions must have rollback procedures
 * - Rollback timeout is action-dependent
 * - Rollback actions must be simpler than original action
 */
export function defineRollbackStrategy(action: RecommendedAction): RollbackPlan {
  const rollbackActions: RecommendedAction[] = [];
  const rollbackConditions: string[] = [];
  let rollbackTimeout = 300000; // 5 minutes default

  switch (action.action_type) {
    case 'restart_service':
      rollbackActions.push({
        action_type: 'check_service_health',
        description: `Verify ${action.target} is running correctly`,
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: action.target,
        estimated_impact: 'No impact - health check only'
      });
      rollbackConditions.push('Service fails to start within 60 seconds');
      rollbackConditions.push('Service health checks fail');
      rollbackTimeout = 120000; // 2 minutes
      break;

    case 'scale_resources':
      const originalReplicas = action.params?.original_replicas || 1;
      rollbackActions.push({
        action_type: 'scale_resources',
        description: `Scale ${action.target} back to ${originalReplicas} replicas`,
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: action.target,
        params: { replicas: originalReplicas },
        estimated_impact: 'Low risk - reverting to previous scale'
      });
      rollbackConditions.push('Resource utilization exceeds 90%');
      rollbackConditions.push('Service becomes unhealthy');
      rollbackTimeout = 180000; // 3 minutes
      break;

    case 'update_configuration':
      rollbackActions.push({
        action_type: 'restore_configuration',
        description: `Restore previous configuration for ${action.target}`,
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: action.target,
        params: action.params?.backup_config ? { config: action.params.backup_config } : {},
        estimated_impact: 'Low risk - reverting to known good configuration'
      });
      rollbackConditions.push('Service fails to start with new configuration');
      rollbackConditions.push('Configuration validation fails');
      rollbackTimeout = 240000; // 4 minutes
      break;

    case 'database_operation':
      rollbackActions.push({
        action_type: 'restore_database_backup',
        description: `Restore database backup for ${action.target}`,
        risk_level: ActionRiskLevel.REQUIRES_APPROVAL,
        target: action.target,
        estimated_impact: 'High risk - requires approval for database restoration'
      });
      rollbackConditions.push('Database integrity check fails');
      rollbackConditions.push('Application connectivity to database fails');
      rollbackTimeout = 600000; // 10 minutes
      break;

    default:
      // Generic rollback strategy
      rollbackActions.push({
        action_type: 'verify_system_health',
        description: `Verify system health after ${action.action_type}`,
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: action.target,
        estimated_impact: 'No impact - verification only'
      });
      rollbackConditions.push('System health checks fail');
      rollbackConditions.push('Action verification fails');
      break;
  }

  return {
    rollback_actions: rollbackActions,
    rollback_conditions: rollbackConditions,
    rollback_timeout: rollbackTimeout
  };
}

/**
 * Validates action execution result
 * Business Rules:
 * - Success must be explicitly indicated
 * - Error messages must be provided for failures
 * - Verification within 60 seconds
 */
export function validateActionResult(result: any, expected: any): boolean {
  if (!result) {
    return false;
  }

  // Check for explicit success indicator
  if (result.success === false || result.status === 'failed') {
    return false;
  }

  if (result.success === true || result.status === 'completed') {
    return true;
  }

  // Check expected outcomes
  if (expected) {
    if (expected.service_running && !result.service_running) {
      return false;
    }
    if (expected.replicas && result.replicas !== expected.replicas) {
      return false;
    }
    if (expected.configuration_applied && !result.configuration_applied) {
      return false;
    }
  }

  // Default validation - assume success if no explicit failure
  return !result.error && !result.errors;
}

/**
 * Formats execution report for logging and monitoring
 */
export function formatExecutionReport(
  action: RecommendedAction,
  result: ExecutionResult
): ExecutionReport {
  return {
    action,
    result,
    timestamp: new Date().toISOString(),
    execution_id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * Determines if an action can be executed autonomously
 * Business Rules:
 * - Only AUTONOMOUS_SAFE actions can run without approval
 * - Must pass risk assessment
 */
export function canExecuteAutonomously(action: RecommendedAction, context?: Incident): boolean {
  // Basic risk level check
  if (action.risk_level !== ActionRiskLevel.AUTONOMOUS_SAFE) {
    return false;
  }

  // Action-specific autonomous execution rules
  switch (action.action_type) {
    case 'database_operation':
    case 'database_migration':
    case 'db_backup':
    case 'db_restore':
      return false; // DB operations never autonomous

    case 'restart_service':
      if (context) {
        const restartAttempts = context.metadata?.restart_attempts || 0;
        return restartAttempts < 3;
      }
      return true;

    case 'scale_resources':
      const replicas = action.params?.replicas || 1;
      return replicas <= 5; // Only small scale operations

    case 'update_configuration':
      return action.params?.requires_restart !== true;

    default:
      return true; // Default to allowing autonomous execution for safe actions
  }
}

/**
 * Calculates risk level for an action based on type and parameters
 */
export function calculateRiskLevel(action: RecommendedAction): ActionRiskLevel {
  // Database operations are always high risk
  if (action.action_type.includes('database') || action.action_type.includes('db')) {
    return ActionRiskLevel.REQUIRES_APPROVAL;
  }

  // Network changes are high risk
  if (action.action_type.includes('network') || action.action_type.includes('firewall')) {
    return ActionRiskLevel.REQUIRES_APPROVAL;
  }

  // Large scaling operations
  if (action.action_type === 'scale_resources') {
    const replicas = action.params?.replicas || 1;
    if (replicas > 10) {
      return ActionRiskLevel.REQUIRES_APPROVAL;
    }
  }

  // Configuration changes that require restart
  if (action.action_type === 'update_configuration' && action.params?.requires_restart) {
    return ActionRiskLevel.REQUIRES_APPROVAL;
  }

  // Default to existing risk level or safe
  return action.risk_level || ActionRiskLevel.AUTONOMOUS_SAFE;
}

/**
 * Generates unique execution ID
 */
export function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}