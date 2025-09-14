import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
// Import MVC components
import * as Model from './model';
import * as Controller from './controller';
import {
  IncidentAlert,
  ProcessingResult
} from '../types/shared';

/**
 * CONTROLLER LAYER - Incident Orchestrator Service (Private)
 * Coordinates agent-first incident response workflow
 * Agent receives alerts, assesses, gathers data, analyzes, and decides/executes
 */
export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    // Private service - not accessible from public internet
    // Called by other services via env bindings
    // Main agent workflow orchestration happens here

    return new Response('Not implemented - use service bindings to call specific functions');
  }

  /**
   * Main service binding method for handling incident alerts
   * Called by other services via env.INCIDENT_ORCHESTRATOR.handleIncident(alert)
   */
  async handleIncident(alert: IncidentAlert): Promise<ProcessingResult> {
    return await Controller.handleIncident(alert, this.env as any);
  }

  /**
   * Service binding method for executing agent workflow on existing incident
   * Called by other services via env.INCIDENT_ORCHESTRATOR.executeAgentWorkflow(incidentId)
   */
  async executeAgentWorkflow(incidentId: string): Promise<Model.WorkflowResult> {
    return await Controller.executeAgentWorkflow(incidentId, this.env as any);
  }

  /**
   * Service binding method for agent assessment
   * Used internally and by other services for incident analysis
   */
  async performAgentAssessment(incident: any) {
    return await Controller.performAgentAssessment(incident, this.env as any);
  }

  /**
   * Service binding method for data gathering via MCP
   * Used internally and by other services for diagnostic data collection
   */
  async gatherDataViaMCP(strategy: any) {
    return await Controller.gatherDataViaMCP(strategy, this.env as any);
  }

  /**
   * Service binding method for agent-driven RCA analysis
   * Used internally and by other services for incident analysis
   */
  async performAgentAnalysis(incident: any, data: any) {
    return await Controller.performAgentAnalysis(incident, data, this.env as any);
  }

  /**
   * Service binding method for executing recommended actions
   * Used internally for autonomous remediation
   */
  async executeRecommendedActions(actions: any) {
    return await Controller.executeRecommendedActions(actions, this.env as any);
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
