import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';

// Import MVC components
import * as Model from './model';
import * as Controller from './controller';
import {
  RecommendedAction,
  Incident,
  RemediationResult,
  ApprovalResult,
  ActionStatus,
  RollbackResult
} from '../types/shared';

/**
 * VIEW LAYER - Remediation Coordinator Service (Private)
 * Coordinates remediation action execution for incidents
 * Handles both autonomous and approval-required actions
 */
export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    // Private service - not accessible from public internet
    // Called by other services via env bindings
    // Main remediation coordination happens via service bindings

    return new Response('Not implemented - use service bindings to call specific functions');
  }

  /**
   * Main service binding method for executing remediation actions
   * Called by other services via env.REMEDIATION_COORDINATOR.executeRemediation(actions, incident)
   *
   * This is the critical method that was missing and causing the RPC error
   */
  async executeRemediation(actions: RecommendedAction[], incident: Incident): Promise<RemediationResult> {
    return await Controller.executeRemediation(actions, incident, this.env);
  }

  /**
   * Service binding method for executing only autonomous safe actions
   * Called by other services via env.REMEDIATION_COORDINATOR.executeAutonomousActions(actions)
   */
  async executeAutonomousActions(
    actions: RecommendedAction[]
  ): Promise<{ executed_actions: string[]; skipped_actions: string[] }> {
    return await Controller.executeAutonomousActions(actions, this.env);
  }

  /**
   * Service binding method for requesting approval for high-risk actions
   * Called by other services via env.REMEDIATION_COORDINATOR.requestApprovalForActions(actions, incident)
   */
  async requestApprovalForActions(
    actions: RecommendedAction[],
    incident: Incident
  ): Promise<ApprovalResult> {
    return await Controller.requestApprovalForActions(actions, incident, this.env);
  }

  /**
   * Service binding method for monitoring action execution results
   * Called by other services via env.REMEDIATION_COORDINATOR.monitorActionResults(executionId)
   */
  async monitorActionResults(executionId: string): Promise<ActionStatus> {
    return await Controller.monitorActionResults(executionId, this.env);
  }

  /**
   * Service binding method for executing rollback of failed actions
   * Called by other services via env.REMEDIATION_COORDINATOR.executeRollback(action, reason)
   */
  async executeRollback(action: RecommendedAction, reason: string): Promise<RollbackResult> {
    return await Controller.executeRollback(action, reason, this.env);
  }

  /**
   * Service binding method for validating remediation actions
   * Used internally and by other services for action validation
   */
  async validateRemediationAction(action: RecommendedAction) {
    return Model.validateRemediationAction(action);
  }

  /**
   * Service binding method for assessing execution risk
   * Used internally and by other services for risk assessment
   */
  async assessExecutionRisk(action: RecommendedAction, incident: Incident) {
    return Model.assessExecutionRisk(action, incident);
  }

  /**
   * Service binding method for defining rollback strategy
   * Used internally and by other services for rollback planning
   */
  async defineRollbackStrategy(action: RecommendedAction) {
    return Model.defineRollbackStrategy(action);
  }

  /**
   * Service binding method for formatting execution reports
   * Used internally and by other services for reporting
   */
  async formatExecutionReport(action: RecommendedAction, result: any) {
    return Model.formatExecutionReport(action, result);
  }

  /**
   * Service binding method for checking if action can be executed autonomously
   * Used internally and by other services for autonomous execution decisions
   */
  async canExecuteAutonomously(action: RecommendedAction, context?: Incident): Promise<boolean> {
    return Model.canExecuteAutonomously(action, context);
  }

  /**
   * Health check endpoint for service monitoring
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  }
}