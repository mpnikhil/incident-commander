import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
// Import MVC components
import * as Model from './model';
import * as Controller from './controller';
import {
  IncidentAlert,
  ValidationError,
  NotFoundError,
  ProcessingError
} from '../types/shared';

/**
 * VIEW LAYER - SRE API Service (Public)
 * Handles HTTP requests using Hono-style framework
 * Coordinates with Controller and Model layers for request processing
 */
export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    // Set up CORS headers for all responses
    const corsHeaders = this.getCORSHeaders();

    try {
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: corsHeaders
        });
      }

      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      this.env.logger.info('Incoming request', {
        method,
        path,
        user_agent: request.headers.get('user-agent'),
        timestamp: new Date().toISOString()
      });

      // Route handling
      if (method === 'POST' && path === '/api/incidents/alert') {
        return await this.handleIncidentAlert(request, corsHeaders);
      }

      if (method === 'GET' && path === '/incidents') {
        return await this.listIncidents(corsHeaders);
      }

      if (method === 'GET' && path.match(/^\/incidents\/([^\/]+)$/)) {
        const incidentId = path.split('/')[2];
        if (!incidentId) {
          return this.createErrorResponse(400, 'Invalid incident ID', corsHeaders);
        }
        return await this.getIncidentDetails(incidentId, corsHeaders);
      }

      if (method === 'GET' && path.match(/^\/incidents\/([^\/]+)\/analysis$/)) {
        const incidentId = path.split('/')[2];
        if (!incidentId) {
          return this.createErrorResponse(400, 'Invalid incident ID', corsHeaders);
        }
        return await this.getAnalysisResults(incidentId, corsHeaders);
      }

      if (method === 'POST' && path.match(/^\/incidents\/([^\/]+)\/remediate$/)) {
        const incidentId = path.split('/')[2];
        if (!incidentId) {
          return this.createErrorResponse(400, 'Invalid incident ID', corsHeaders);
        }
        return await this.triggerRemediation(incidentId, request, corsHeaders);
      }

      if (method === 'GET' && path === '/health') {
        return await this.getHealthStatus(corsHeaders);
      }

      // Route not found
      return this.createErrorResponse(404, 'Route not found', corsHeaders);

    } catch (error) {
      this.env.logger.error('Unhandled error in request processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: request.url,
        method: request.method
      });

      return this.createErrorResponse(500, 'Internal server error', corsHeaders);
    }
  }

  /**
   * Handles POST /api/incidents/alert - Agent receives incident notifications
   */
  private async handleIncidentAlert(request: Request, corsHeaders: Headers): Promise<Response> {
    try {
      // Parse and validate request body
      const body = await this.parseJSONBody(request);
      if (!body) {
        return this.createErrorResponse(400, 'Request body must be valid JSON', corsHeaders);
      }

      // Validate required fields
      const validationResult = Model.validateJSONPayload(body, [
        'source', 'alert_type', 'severity', 'message', 'timestamp', 'affected_services', 'metadata'
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(400, 'Missing required fields', corsHeaders, validationResult.errors);
      }

      // Sanitize input data
      const sanitizedAlert = Model.sanitizeInput(body) as IncidentAlert;

      // Validate incident alert structure
      const alertValidation = Model.validateIncidentAlert(sanitizedAlert);
      if (!alertValidation.isValid) {
        return this.createErrorResponse(400, 'Invalid incident alert', corsHeaders, alertValidation.errors);
      }

      // Process alert through controller
      const processingResult = await Controller.handleIncidentAlert(sanitizedAlert, this.env);

      // Format response
      const responseData = {
        incident_id: processingResult.agent_analysis?.incident_id || `INC-${Date.now()}`,
        agent_status: 'Alert received - Starting initial assessment',
        initial_assessment: this.generateAssessmentFromAlert(sanitizedAlert),
        estimated_analysis_time: this.calculateAnalysisTime(sanitizedAlert.severity),
        processing_status: processingResult.status,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      if (error instanceof ValidationError) {
        return this.createErrorResponse(400, error.message, corsHeaders);
      }

      if (error instanceof ProcessingError) {
        return this.createErrorResponse(500, error.message, corsHeaders);
      }

      this.env.logger.error('Error processing incident alert', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Failed to process incident alert', corsHeaders);
    }
  }

  /**
   * Handles GET /incidents/{id} - Get incident details
   */
  private async getIncidentDetails(incidentId: string, corsHeaders: Headers): Promise<Response> {
    try {
      // Validate incident ID format
      if (!Model.validateIncidentId(incidentId)) {
        return this.createErrorResponse(400, 'Invalid incident ID format', corsHeaders);
      }

      // Get incident details from controller
      const incident = await Controller.getIncidentDetails(incidentId, this.env);

      // Format response using model
      const responseData = Model.formatIncidentResponse(incident);

      return new Response(JSON.stringify({
        ...responseData,
        details: {
          id: incident.id,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          status: incident.status,
          source: incident.source,
          affected_services: incident.affected_services,
          created_at: incident.created_at,
          updated_at: incident.updated_at,
          metadata: incident.metadata
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      if (error instanceof NotFoundError) {
        return this.createErrorResponse(404, error.message, corsHeaders);
      }

      if (error instanceof ProcessingError) {
        return this.createErrorResponse(500, error.message, corsHeaders);
      }

      this.env.logger.error('Error getting incident details', {
        incident_id: incidentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Failed to retrieve incident details', corsHeaders);
    }
  }

  /**
   * Handles GET /incidents/{id}/analysis - Get RCA results
   */
  private async getAnalysisResults(incidentId: string, corsHeaders: Headers): Promise<Response> {
    try {
      // Validate incident ID format
      if (!Model.validateIncidentId(incidentId)) {
        return this.createErrorResponse(400, 'Invalid incident ID format', corsHeaders);
      }

      // Get analysis results from controller
      const rcaResult = await Controller.getAnalysisResults(incidentId, this.env);

      // Format response using model
      const responseData = Model.formatRCAResponse(rcaResult);

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      if (error instanceof NotFoundError) {
        return this.createErrorResponse(404, error.message, corsHeaders);
      }

      if (error instanceof ProcessingError) {
        return this.createErrorResponse(500, error.message, corsHeaders);
      }

      this.env.logger.error('Error getting analysis results', {
        incident_id: incidentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Failed to retrieve analysis results', corsHeaders);
    }
  }

  /**
   * Handles POST /incidents/{id}/remediate - Trigger remediation
   */
  private async triggerRemediation(incidentId: string, request: Request, corsHeaders: Headers): Promise<Response> {
    try {
      // Validate incident ID format
      if (!Model.validateIncidentId(incidentId)) {
        return this.createErrorResponse(400, 'Invalid incident ID format', corsHeaders);
      }

      // Parse request body
      const body = await this.parseJSONBody(request);
      if (!body || typeof body.approved !== 'boolean') {
        return this.createErrorResponse(400, 'Request body must contain "approved" boolean field', corsHeaders);
      }

      // Trigger remediation through controller
      const remediationResult = await Controller.triggerRemediation(incidentId, body.approved, this.env);

      // Format response using model
      const responseData = Model.formatRemediationResponse(remediationResult);

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      if (error instanceof NotFoundError) {
        return this.createErrorResponse(404, error.message, corsHeaders);
      }

      if (error instanceof ProcessingError) {
        return this.createErrorResponse(500, error.message, corsHeaders);
      }

      this.env.logger.error('Error triggering remediation', {
        incident_id: incidentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Failed to trigger remediation', corsHeaders);
    }
  }

  /**
   * Handles GET /incidents - List all incidents
   */
  private async listIncidents(corsHeaders: Headers): Promise<Response> {
    try {
      const incidents = await Controller.listIncidents(this.env);

      return new Response(JSON.stringify({
        incidents: incidents || [],
        total_count: incidents ? incidents.length : 0,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      this.env.logger.error('Error listing incidents', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Failed to list incidents', corsHeaders);
    }
  }

  /**
   * Handles GET /health - Health check endpoint
   */
  private async getHealthStatus(corsHeaders: Headers): Promise<Response> {
    try {
      const healthStatus = await Controller.getHealthStatus(this.env);

      return new Response(JSON.stringify({
        service: 'sre-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        ...healthStatus
      }), {
        status: healthStatus.status === 'healthy' ? 200 : 503,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(corsHeaders)
        }
      });

    } catch (error) {
      this.env.logger.error('Error getting health status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResponse(500, 'Health check failed', corsHeaders);
    }
  }

  // Helper methods

  /**
   * Creates CORS headers for all responses
   */
  private getCORSHeaders(): Headers {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    return headers;
  }

  /**
   * Parses JSON body with error handling
   */
  private async parseJSONBody(request: Request): Promise<any | null> {
    try {
      const text = await request.text();
      if (!text) {
        return null;
      }
      return JSON.parse(text);
    } catch (error) {
      this.env.logger.warn('Failed to parse JSON body', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Creates standardized error responses
   */
  private createErrorResponse(
    status: number,
    message: string,
    corsHeaders: Headers,
    details?: string[]
  ): Response {
    const errorResponse = Model.formatErrorResponse(new Error(message));

    if (details) {
      errorResponse.details = details;
    }

    return new Response(JSON.stringify(errorResponse), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(corsHeaders)
      }
    });
  }

  /**
   * Generates initial assessment from alert data
   */
  private generateAssessmentFromAlert(alert: IncidentAlert): string {
    const affectedServices = alert.affected_services.join(', ');

    const assessmentMap: Record<string, string> = {
      'P0': `CRITICAL: Service outage detected affecting ${affectedServices}. Immediate investigation required.`,
      'P1': `HIGH: Major functionality impacted for ${affectedServices}. Prioritizing analysis.`,
      'P2': `MEDIUM: Minor functionality issues detected for ${affectedServices}. Investigating impact.`,
      'P3': `LOW: Minimal impact incident for ${affectedServices}. Standard investigation procedures.`
    };

    return assessmentMap[alert.severity] || `Incident detected affecting ${affectedServices}. Analyzing impact.`;
  }

  /**
   * Calculates estimated analysis time based on severity
   */
  private calculateAnalysisTime(severity: string): string {
    const timeMap: Record<string, string> = {
      'P0': '2-5 minutes',
      'P1': '5-10 minutes',
      'P2': '10-15 minutes',
      'P3': '15-30 minutes'
    };

    return timeMap[severity] || '5-15 minutes';
  }
}