import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Env } from './raindrop.gen';
import SREApiService from './index';
import { IncidentAlert, IncidentSeverity, IncidentStatus } from '../types/shared';

// Mock environment
const createMockEnv = (): Env => ({
  _raindrop: {
    app: {} as any
  },
  AI: {} as any,
  annotation: {} as any,
  CONVERSATION_MEMORY: {} as any,
  EXTERNAL_API_KEY: 'test-key',
  INCIDENT_DATA: {
    getIncident: vi.fn(),
    createIncident: vi.fn()
  } as any,
  INCIDENT_ORCHESTRATOR: {
    handleIncident: vi.fn()
  } as any,
  KNOWLEDGE_BASE: {} as any,
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  } as any,
  METRICS_DATABASE: {} as any,
  NOTIFICATION_QUEUE: {} as any,
  RCA_ENGINE: {
    analyzeIncident: vi.fn()
  } as any,
  REMEDIATION_COORDINATOR: {
    executeRemediation: vi.fn()
  } as any,
  SMTP_HOST: 'localhost',
  SMTP_PASSWORD: 'password',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  tracer: {} as any
});

describe('SRE API Service - Model Layer Tests', () => {
  test('validateIncidentAlert should accept valid alert', async () => {
    const validAlert: IncidentAlert = {
      source: 'prometheus',
      alert_type: 'service_down',
      severity: 'P0',
      message: 'Service API Gateway is down',
      affected_services: ['api-gateway'],
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { region: 'us-west-2' }
    };

    const { validateIncidentAlert } = await import('./model');
    const result = validateIncidentAlert(validAlert);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('validateIncidentAlert should reject invalid severity', async () => {
    const invalidAlert: IncidentAlert = {
      source: 'prometheus',
      alert_type: 'service_down',
      severity: 'INVALID',
      message: 'Service API Gateway is down',
      affected_services: ['api-gateway'],
      timestamp: '2024-01-15T10:30:00Z',
      metadata: {}
    };

    const { validateIncidentAlert } = await import('./model');
    const result = validateIncidentAlert(invalidAlert);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid severity: must be P0, P1, P2, or P3');
  });

  test('validateIncidentAlert should reject missing required fields', async () => {
    const invalidAlert = {
      source: 'prometheus',
      // Missing required fields
      timestamp: '2024-01-15T10:30:00Z',
      metadata: {}
    } as IncidentAlert;

    const { validateIncidentAlert } = await import('./model');
    const result = validateIncidentAlert(invalidAlert);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('validateIncidentId should accept valid incident ID', async () => {
    const { validateIncidentId } = await import('./model');

    expect(validateIncidentId('INC-2024-001')).toBe(true);
    expect(validateIncidentId('incident-123')).toBe(true);
    expect(validateIncidentId('abc123def')).toBe(true);
  });

  test('validateIncidentId should reject invalid incident ID', async () => {
    const { validateIncidentId } = await import('./model');

    expect(validateIncidentId('')).toBe(false);
    expect(validateIncidentId('invalid@id')).toBe(false);
    expect(validateIncidentId('spaces not allowed')).toBe(false);
  });

  test('formatErrorResponse should create structured error response', async () => {
    const { formatErrorResponse } = await import('./model');
    const error = new Error('Test error');

    const response = formatErrorResponse(error);

    expect(response).toMatchObject({
      error: true,
      message: 'Test error',
      timestamp: expect.any(String)
    });
  });
});

describe('SRE API Service - Controller Layer Tests', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  test('handleIncidentAlert should process valid alert', async () => {
    const validAlert: IncidentAlert = {
      source: 'prometheus',
      alert_type: 'service_down',
      severity: 'P0',
      message: 'Service API Gateway is down',
      affected_services: ['api-gateway'],
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { region: 'us-west-2' }
    };

    const mockProcessingResult = {
      status: 'processing',
      agent_analysis: {
        incident_id: 'INC-001',
        root_cause: 'Analysis in progress',
        evidence: [],
        confidence_score: 0,
        contributing_factors: [],
        recommended_actions: [],
        analysis_timeline: [],
        prevention_strategies: []
      },
      actions_taken: [],
      timeline: []
    };

    (mockEnv.INCIDENT_ORCHESTRATOR as any).handleIncident.mockResolvedValue(mockProcessingResult);

    const { handleIncidentAlert } = await import('./controller');
    const result = await handleIncidentAlert(validAlert, mockEnv);

    expect(mockEnv.INCIDENT_ORCHESTRATOR.handleIncident).toHaveBeenCalledWith(validAlert);
    expect(result).toEqual(mockProcessingResult);
  });

  test('getIncidentDetails should retrieve incident from data service', async () => {
    const mockIncident = {
      id: 'INC-001',
      title: 'Service Down',
      description: 'API Gateway is down',
      severity: IncidentSeverity.P0,
      status: IncidentStatus.INVESTIGATING,
      source: 'prometheus',
      affected_services: ['api-gateway'],
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
      metadata: {}
    };

    (mockEnv.INCIDENT_DATA as any).getIncident.mockResolvedValue(mockIncident);

    const { getIncidentDetails } = await import('./controller');
    const result = await getIncidentDetails('INC-001', mockEnv);

    expect(mockEnv.INCIDENT_DATA.getIncident).toHaveBeenCalledWith('INC-001');
    expect(result).toEqual(mockIncident);
  });

  test('getIncidentDetails should handle not found errors', async () => {
    (mockEnv.INCIDENT_DATA as any).getIncident.mockRejectedValue(new Error('Incident not found'));

    const { getIncidentDetails } = await import('./controller');

    await expect(getIncidentDetails('INVALID', mockEnv)).rejects.toThrow('Incident not found');
  });

  test('triggerRemediation should call remediation coordinator', async () => {
    const mockRemediationResult = {
      incident_id: 'INC-001',
      actions_executed: ['restart_service'],
      results: ['Service restarted successfully'],
      status: 'completed'
    };

    (mockEnv.REMEDIATION_COORDINATOR as any).executeRemediation.mockResolvedValue(mockRemediationResult);

    const { triggerRemediation } = await import('./controller');
    const result = await triggerRemediation('INC-001', true, mockEnv);

    expect(mockEnv.REMEDIATION_COORDINATOR.executeRemediation).toHaveBeenCalledWith('INC-001', true);
    expect(result).toEqual(mockRemediationResult);
  });
});

describe('SRE API Service - View Layer Tests', () => {
  let service: SREApiService;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();
    service = new SREApiService({} as any, mockEnv);
    vi.clearAllMocks();
  });

  test('POST /api/incidents/alert should accept valid alert', async () => {
    const validAlert: IncidentAlert = {
      source: 'prometheus',
      alert_type: 'service_down',
      severity: 'P0',
      message: 'Service API Gateway is down',
      affected_services: ['api-gateway'],
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { region: 'us-west-2' }
    };

    const mockProcessingResult = {
      status: 'processing',
      agent_analysis: {
        incident_id: 'INC-001',
        root_cause: 'Analysis in progress',
        evidence: [],
        confidence_score: 0,
        contributing_factors: [],
        recommended_actions: [],
        analysis_timeline: [],
        prevention_strategies: []
      },
      actions_taken: [],
      timeline: []
    };

    (mockEnv.INCIDENT_ORCHESTRATOR as any).handleIncident.mockResolvedValue(mockProcessingResult);

    const request = new Request('http://localhost/api/incidents/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAlert)
    });

    const response = await service.fetch(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData.incident_id).toBeDefined();
    expect(responseData.agent_status).toBeDefined();
  });

  test('POST /api/incidents/alert should return 400 for invalid alert', async () => {
    const invalidAlert = {
      source: 'prometheus',
      // Missing required fields
      timestamp: '2024-01-15T10:30:00Z'
    };

    const request = new Request('http://localhost/api/incidents/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidAlert)
    });

    const response = await service.fetch(request);

    expect(response.status).toBe(400);
  });

  test('GET /incidents/{id} should return incident details', async () => {
    const mockIncident = {
      id: 'INC-001',
      title: 'Service Down',
      description: 'API Gateway is down',
      severity: IncidentSeverity.P0,
      status: IncidentStatus.INVESTIGATING,
      source: 'prometheus',
      affected_services: ['api-gateway'],
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
      metadata: {}
    };

    (mockEnv.INCIDENT_DATA as any).getIncident.mockResolvedValue(mockIncident);

    const request = new Request('http://localhost/incidents/INC-001', {
      method: 'GET'
    });

    const response = await service.fetch(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData.id).toBe('INC-001');
  });

  test('GET /incidents/{id} should return 404 for non-existent incident', async () => {
    (mockEnv.INCIDENT_DATA as any).getIncident.mockRejectedValue(new Error('Incident not found'));

    const request = new Request('http://localhost/incidents/INVALID', {
      method: 'GET'
    });

    const response = await service.fetch(request);

    expect(response.status).toBe(404);
  });

  test('GET /incidents/{id}/analysis should return RCA results', async () => {
    const mockRCAResult = {
      incident_id: 'INC-001',
      root_cause: 'Database connection timeout',
      evidence: ['High response times', 'Database errors in logs'],
      confidence_score: 0.85,
      contributing_factors: ['High load', 'Network latency'],
      recommended_actions: [{
        action_type: 'restart_service',
        description: 'Restart the API Gateway service',
        risk_level: 'autonomous_safe' as const,
        target: 'api-gateway',
        estimated_impact: 'Service will be unavailable for 30 seconds'
      }],
      analysis_timeline: ['10:30 - Incident detected', '10:31 - Analysis started'],
      prevention_strategies: ['Implement connection pooling']
    };

    vi.mocked(mockEnv.RCA_ENGINE.analyzeIncident).mockResolvedValue(mockRCAResult);

    const request = new Request('http://localhost/incidents/INC-001/analysis', {
      method: 'GET'
    });

    const response = await service.fetch(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData.incident_id).toBe('INC-001');
    expect(responseData.root_cause).toBeDefined();
  });

  test('POST /incidents/{id}/remediate should trigger remediation', async () => {
    const mockRemediationResult = {
      incident_id: 'INC-001',
      actions_executed: ['restart_service'],
      results: ['Service restarted successfully'],
      status: 'completed'
    };

    (mockEnv.REMEDIATION_COORDINATOR as any).executeRemediation.mockResolvedValue(mockRemediationResult);

    const request = new Request('http://localhost/incidents/INC-001/remediate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true })
    });

    const response = await service.fetch(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData.incident_id).toBe('INC-001');
    expect(responseData.status).toBe('completed');
  });

  test('should handle CORS preflight requests', async () => {
    const request = new Request('http://localhost/api/incidents/alert', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    const response = await service.fetch(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  test('should return 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown-route', {
      method: 'GET'
    });

    const response = await service.fetch(request);

    expect(response.status).toBe(404);
  });

  test('should return 500 for internal errors', async () => {
    vi.mocked(mockEnv.INCIDENT_ORCHESTRATOR.handleIncident).mockRejectedValue(new Error('Internal server error'));

    const validAlert: IncidentAlert = {
      source: 'prometheus',
      alert_type: 'service_down',
      severity: 'P0',
      message: 'Service API Gateway is down',
      affected_services: ['api-gateway'],
      timestamp: '2024-01-15T10:30:00Z',
      metadata: {}
    };

    const request = new Request('http://localhost/api/incidents/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAlert)
    });

    const response = await service.fetch(request);

    expect(response.status).toBe(500);
  });
});