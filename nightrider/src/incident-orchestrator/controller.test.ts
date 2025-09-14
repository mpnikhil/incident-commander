import { vi } from 'vitest';
import * as Controller from './controller';
import * as Model from './model';
import {
  IncidentAlert,
  Incident,
  ProcessingResult,
  GatherDataStrategy,
  GatheredData,
  RCAResult,
  IncidentSeverity,
  IncidentStatus,
  ActionRiskLevel,
  LogEntry,
  MetricData,
  AlertData,
  SystemStatus,
  RunbookEntry,
  RecommendedAction
} from '../types/shared';

// Mock environment
const mockEnv = {
  AI: {
    run: vi.fn()
  },
  SRE_MCP: {
    getLogs: vi.fn(),
    getMetrics: vi.fn(),
    getAlerts: vi.fn(),
    getSystemStatus: vi.fn(),
    searchRunbooks: vi.fn()
  },
  INCIDENT_DATA: {
    createIncident: vi.fn(),
    updateIncident: vi.fn(),
    getIncident: vi.fn()
  },
  RCA_ENGINE: {
    performRCA: vi.fn()
  },
  REMEDIATION_COORDINATOR: {
    executeRemediation: vi.fn()
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
};

describe('IncidentOrchestrator Controller', () => {
  const mockAlert: IncidentAlert = {
    source: 'monitoring-system',
    alert_type: 'database_connection_failed',
    severity: 'P1',
    message: 'Database connection timeout in us-west-2',
    affected_services: ['api-service', 'user-service'],
    timestamp: '2025-01-15T10:00:00Z',
    metadata: { region: 'us-west-2', error_count: 5 }
  };

  const mockIncident: Incident = {
    id: 'incident-123',
    title: 'Database Connection Failed',
    description: 'Unable to connect to primary database',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.RECEIVED,
    source: 'monitoring-system',
    affected_services: ['api-service', 'user-service'],
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
    metadata: { region: 'us-west-2', cluster: 'prod' }
  };

  const mockGatheredData: GatheredData = {
    logs: [
      {
        timestamp: '2025-01-15T09:58:00Z',
        service: 'api-service',
        level: 'ERROR',
        message: 'Connection timeout to database',
        metadata: { connection_pool: 'primary' }
      }
    ],
    metrics: [
      {
        metric_name: 'database_connections_active',
        timestamp: '2025-01-15T09:59:00Z',
        value: 0,
        labels: { service: 'api-service' }
      }
    ],
    alerts: [
      {
        id: 'alert-456',
        severity: 'HIGH',
        trigger_condition: 'database_connections < 1',
        timestamp: '2025-01-15T10:00:00Z',
        service: 'api-service',
        status: 'firing'
      }
    ],
    system_status: [
      {
        service: 'api-service',
        status: 'degraded',
        dependencies: ['database'],
        health_checks: { database: false, cache: true }
      }
    ],
    runbooks: [
      {
        id: 'runbook-789',
        title: 'Database Connection Issues',
        content: '1. Check connection pool 2. Restart service if needed',
        incident_types: ['database_connection_failed'],
        procedures: ['check_pool', 'restart_service']
      }
    ]
  };

  const mockRCAResult: RCAResult = {
    incident_id: 'incident-123',
    root_cause: 'Database connection pool exhaustion due to high load',
    evidence: ['Connection timeout errors', 'Zero active connections'],
    confidence_score: 0.92,
    contributing_factors: ['High traffic spike', 'Insufficient connection pool size'],
    recommended_actions: [
      {
        action_type: 'restart_service',
        description: 'Restart API service to reset connection pool',
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
        target: 'api-service',
        estimated_impact: 'low'
      }
    ],
    analysis_timeline: ['10:00 - Alert received', '10:02 - Data gathered'],
    prevention_strategies: ['Increase connection pool size', 'Implement connection pooling']
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleIncident', () => {
    it('should process complete incident workflow successfully', async () => {
      // Setup mocks
      mockEnv.INCIDENT_DATA.createIncident.mockResolvedValue(mockIncident);
      mockEnv.AI.run.mockResolvedValueOnce('{"data_strategy": "comprehensive"}');
      mockEnv.SRE_MCP.getLogs.mockResolvedValue(mockGatheredData.logs);
      mockEnv.SRE_MCP.getMetrics.mockResolvedValue(mockGatheredData.metrics);
      mockEnv.SRE_MCP.getAlerts.mockResolvedValue(mockGatheredData.alerts);
      mockEnv.SRE_MCP.getSystemStatus.mockResolvedValue(mockGatheredData.system_status);
      mockEnv.SRE_MCP.searchRunbooks.mockResolvedValue(mockGatheredData.runbooks);
      mockEnv.RCA_ENGINE.performRCA.mockResolvedValue(mockRCAResult);
      mockEnv.REMEDIATION_COORDINATOR.executeRemediation.mockResolvedValue({
        success: true,
        executed_actions: ['restart_service']
      });

      const result = await Controller.handleIncident(mockAlert, mockEnv);

      expect(result.status).toBe('completed');
      expect(result.agent_analysis.root_cause).toContain('Database connection pool');
      expect(result.actions_taken).toContain('restart_service');
      expect(mockEnv.INCIDENT_DATA.createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          source: mockAlert.source,
          severity: IncidentSeverity.P1
        })
      );
    });

    it('should handle high-severity incidents with expedited workflow', async () => {
      const p0Alert = { ...mockAlert, severity: 'P0' };
      mockEnv.INCIDENT_DATA.createIncident.mockResolvedValue({
        ...mockIncident,
        severity: IncidentSeverity.P0
      });
      mockEnv.AI.run.mockResolvedValueOnce('{"data_strategy": "expedited"}');

      const result = await Controller.handleIncident(p0Alert, mockEnv);

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        expect.stringContaining('URGENT P0 incident'),
        expect.stringContaining('expedited analysis'),
        'deepseek-v3'
      );
    });

    it('should retry on transient failures with exponential backoff', async () => {
      mockEnv.INCIDENT_DATA.createIncident.mockResolvedValue(mockIncident);
      mockEnv.SRE_MCP.getLogs
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(mockGatheredData.logs);

      const result = await Controller.handleIncident(mockAlert, mockEnv);

      expect(mockEnv.SRE_MCP.getLogs).toHaveBeenCalledTimes(3);
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying after failure')
      );
    });

    it('should escalate after maximum retry attempts', async () => {
      mockEnv.INCIDENT_DATA.createIncident.mockResolvedValue(mockIncident);
      mockEnv.SRE_MCP.getLogs.mockRejectedValue(new Error('Persistent failure'));

      const result = await Controller.handleIncident(mockAlert, mockEnv);

      expect(result.status).toBe('escalated');
      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Maximum retries exceeded')
      );
    });
  });

  describe('executeAgentWorkflow', () => {
    it('should execute complete workflow for existing incident', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.AI.run.mockResolvedValue('{"strategy": "comprehensive_analysis"}');

      const result = await Controller.executeAgentWorkflow('incident-123', mockEnv);

      expect(result.workflow_completed).toBe(true);
      expect(result.status).toBe('completed');
      expect(mockEnv.INCIDENT_DATA.getIncident).toHaveBeenCalledWith('incident-123');
    });

    it('should handle workflow state transitions correctly', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.INVESTIGATING
      });

      await Controller.executeAgentWorkflow('incident-123', mockEnv);

      expect(mockEnv.INCIDENT_DATA.updateIncident).toHaveBeenCalledWith(
        'incident-123',
        expect.objectContaining({
          status: IncidentStatus.INVESTIGATING
        })
      );
    });
  });

  describe('performAgentAssessment', () => {
    it('should generate comprehensive data gathering strategy', async () => {
      mockEnv.AI.run.mockResolvedValue(JSON.stringify({
        incident_type: 'database_connection_failure',
        required_logs: ['api-service', 'database'],
        required_metrics: ['connections', 'response_time'],
        time_range: '1h',
        search_terms: ['connection', 'timeout']
      }));

      const strategy = await Controller.performAgentAssessment(mockIncident, mockEnv);

      expect(strategy.incident_type).toBe('database_connection_failure');
      expect(strategy.required_logs).toContain('api-service');
      expect(strategy.required_metrics).toContain('connections');
      expect(strategy.time_range).toBe('1h');
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        expect.stringContaining('Analyze this incident'),
        expect.stringContaining(mockIncident.description),
        'llama-3.1-8b-instruct'
      );
    });

    it('should adapt strategy based on incident severity', async () => {
      const p0Incident = { ...mockIncident, severity: IncidentSeverity.P0 };
      mockEnv.AI.run.mockResolvedValue(JSON.stringify({
        incident_type: 'critical_outage',
        time_range: '30m'
      }));

      const strategy = await Controller.performAgentAssessment(p0Incident, mockEnv);

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL P0'),
        expect.any(String),
        'deepseek-v3'
      );
    });
  });

  describe('gatherDataViaMCP', () => {
    const mockStrategy: GatherDataStrategy = {
      incident_type: 'database_failure',
      required_logs: ['api-service'],
      required_metrics: ['connections'],
      time_range: '1h',
      search_terms: ['connection', 'error']
    };

    it('should gather all required data types', async () => {
      mockEnv.SRE_MCP.getLogs.mockResolvedValue(mockGatheredData.logs);
      mockEnv.SRE_MCP.getMetrics.mockResolvedValue(mockGatheredData.metrics);
      mockEnv.SRE_MCP.getAlerts.mockResolvedValue(mockGatheredData.alerts);
      mockEnv.SRE_MCP.getSystemStatus.mockResolvedValue(mockGatheredData.system_status);
      mockEnv.SRE_MCP.searchRunbooks.mockResolvedValue(mockGatheredData.runbooks);

      const data = await Controller.gatherDataViaMCP(mockStrategy, mockEnv);

      expect(data.logs).toHaveLength(1);
      expect(data.metrics).toHaveLength(1);
      expect(data.alerts).toHaveLength(1);
      expect(data.system_status).toHaveLength(1);
      expect(data.runbooks).toHaveLength(1);
    });

    it('should handle partial data gathering failures gracefully', async () => {
      mockEnv.SRE_MCP.getLogs.mockResolvedValue(mockGatheredData.logs);
      mockEnv.SRE_MCP.getMetrics.mockRejectedValue(new Error('Metrics unavailable'));
      mockEnv.SRE_MCP.getAlerts.mockResolvedValue(mockGatheredData.alerts);

      const data = await Controller.gatherDataViaMCP(mockStrategy, mockEnv);

      expect(data.logs).toHaveLength(1);
      expect(data.metrics).toHaveLength(0); // Should be empty array on failure
      expect(data.alerts).toHaveLength(1);
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to gather metrics')
      );
    });

    it('should apply time range filters correctly', async () => {
      await Controller.gatherDataViaMCP(mockStrategy, mockEnv);

      expect(mockEnv.SRE_MCP.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          services: ['api-service'],
          time_range: '1h'
        })
      );
    });
  });

  describe('performAgentAnalysis', () => {
    it('should perform comprehensive RCA using AI and gathered data', async () => {
      mockEnv.RCA_ENGINE.performRCA.mockResolvedValue(mockRCAResult);

      const result = await Controller.performAgentAnalysis(
        mockIncident,
        mockGatheredData,
        mockEnv
      );

      expect(result.root_cause).toContain('Database connection pool');
      expect(result.confidence_score).toBeGreaterThan(0.9);
      expect(result.recommended_actions).toHaveLength(1);
      expect(mockEnv.RCA_ENGINE.performRCA).toHaveBeenCalledWith(
        mockIncident,
        mockGatheredData
      );
    });

    it('should validate analysis results', async () => {
      const invalidRCA = { ...mockRCAResult, confidence_score: -0.5 };
      mockEnv.RCA_ENGINE.performRCA.mockResolvedValue(invalidRCA);

      await expect(
        Controller.performAgentAnalysis(mockIncident, mockGatheredData, mockEnv)
      ).rejects.toThrow('Invalid confidence score');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should implement circuit breaker for failing services', async () => {
      // Simulate multiple failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        mockEnv.SRE_MCP.getLogs.mockRejectedValue(new Error('Service down'));
        try {
          await Controller.gatherDataViaMCP(mockStrategy, mockEnv);
        } catch (e) {
          // Expected failures
        }
      }

      // Next call should fail fast due to circuit breaker
      const startTime = Date.now();
      try {
        await Controller.gatherDataViaMCP(mockStrategy, mockEnv);
      } catch (e) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(100); // Should fail fast
      }
    });

    it('should log all errors with full context', async () => {
      const error = new Error('Test error');
      mockEnv.INCIDENT_DATA.createIncident.mockRejectedValue(error);

      try {
        await Controller.handleIncident(mockAlert, mockEnv);
      } catch (e) {
        expect(mockEnv.logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to handle incident'),
          expect.objectContaining({
            error: error.message,
            alert: mockAlert
          })
        );
      }
    });

    it('should handle memory pressure gracefully', async () => {
      const largeData = {
        ...mockGatheredData,
        logs: new Array(100000).fill(mockGatheredData.logs[0])
      };

      mockEnv.SRE_MCP.getLogs.mockResolvedValue(largeData.logs);

      const result = await Controller.gatherDataViaMCP(
        {
          incident_type: 'test',
          required_logs: ['api-service'],
          required_metrics: [],
          time_range: '1h'
        },
        mockEnv
      );

      // Should limit data size to prevent memory issues
      expect(result.logs.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Integration Points', () => {
    it('should coordinate with RCA engine properly', async () => {
      mockEnv.RCA_ENGINE.performRCA.mockResolvedValue(mockRCAResult);

      await Controller.performAgentAnalysis(mockIncident, mockGatheredData, mockEnv);

      expect(mockEnv.RCA_ENGINE.performRCA).toHaveBeenCalledWith(
        mockIncident,
        mockGatheredData
      );
    });

    it('should coordinate with remediation coordinator', async () => {
      const actions = mockRCAResult.recommended_actions;
      mockEnv.REMEDIATION_COORDINATOR.executeRemediation.mockResolvedValue({
        success: true,
        executed_actions: ['restart_service']
      });

      const result = await Controller.executeRecommendedActions(actions, mockEnv);

      expect(result.success).toBe(true);
      expect(mockEnv.REMEDIATION_COORDINATOR.executeRemediation).toHaveBeenCalledWith(
        actions
      );
    });
  });
});

// Additional type for the strategy mock used in tests
const mockStrategy: GatherDataStrategy = {
  incident_type: 'database_failure',
  required_logs: ['api-service'],
  required_metrics: ['connections'],
  time_range: '1h',
  search_terms: ['connection', 'error']
};