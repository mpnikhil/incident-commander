import { expect, test, describe, beforeEach, vi } from 'vitest';
import {
  performRCA,
  generateAnalysisPrompt,
  parseRCAFromLLM,
  enrichWithHistoricalContext,
  saveAnalysisToMemory
} from './controller';
import {
  validateRCAData,
  calculateConfidenceScore,
  rankRootCauseHypotheses,
  assessActionRisk,
  structureRCAResult
} from './model';
import {
  Incident,
  GatheredData,
  IncidentSeverity,
  IncidentStatus,
  ActionRiskLevel,
  ProcessingError
} from '../types/shared';

// Mock environment
const createMockEnv = () => ({
  AI: {
    run: vi.fn()
  },
  CONVERSATION_MEMORY: {
    put: vi.fn(),
    search: vi.fn()
  },
  KNOWLEDGE_BASE: {
    search: vi.fn()
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
});

const mockIncident: Incident = {
  id: 'incident-123',
  title: 'Database Connection Issues',
  description: 'Multiple database connection failures detected',
  severity: IncidentSeverity.P1,
  status: IncidentStatus.INVESTIGATING,
  source: 'monitoring',
  affected_services: ['user-service', 'payment-service'],
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:05:00Z',
  metadata: {
    region: 'us-east-1',
    customer_impact: 'high'
  }
};

const mockGatheredData: GatheredData = {
  logs: [
    {
      timestamp: '2024-01-15T10:00:00Z',
      service: 'user-service',
      level: 'ERROR',
      message: 'Connection timeout to database',
      metadata: { query: 'SELECT * FROM users' }
    },
    {
      timestamp: '2024-01-15T10:01:00Z',
      service: 'payment-service',
      level: 'ERROR',
      message: 'Database connection pool exhausted'
    }
  ],
  metrics: [
    {
      metric_name: 'db_connection_count',
      timestamp: '2024-01-15T10:00:00Z',
      value: 150,
      labels: { service: 'user-service' }
    }
  ],
  alerts: [
    {
      id: 'alert-456',
      severity: 'critical',
      trigger_condition: 'db_connection_count > 100',
      timestamp: '2024-01-15T09:59:00Z',
      service: 'user-service',
      status: 'firing'
    }
  ],
  system_status: [
    {
      service: 'user-service',
      status: 'degraded',
      dependencies: ['postgres-db'],
      health_checks: { database: false, redis: true }
    }
  ],
  runbooks: [
    {
      id: 'runbook-789',
      title: 'Database Connection Issues',
      content: 'Check connection pool settings and restart if needed',
      incident_types: ['database', 'connection'],
      procedures: ['check_pool', 'restart_service'],
      relevance_score: 0.9
    }
  ]
};

describe('RCA Engine Controller', () => {
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('performRCA', () => {
    test('should successfully perform RCA with complete data', async () => {
      const mockLLMResponse = `
ROOT_CAUSE: Database connection pool exhaustion due to high query load

EVIDENCE:
- Connection timeout errors in user-service logs
- Database connection pool exhausted message in payment-service
- db_connection_count metric showing 150 connections (above threshold of 100)

CONFIDENCE: 0.85

CONTRIBUTING_FACTORS:
- High user traffic during peak hours
- Inefficient query patterns causing long-running connections
- Connection pool size not optimized for current load

RECOMMENDED_ACTIONS:
- restart: Restart affected services to clear connection pools (autonomous_safe)
- scale_up: Increase database connection pool size (autonomous_safe)
- optimize_queries: Review and optimize slow-running queries (requires_approval)

TIMELINE:
- 09:59 Database connection alert triggered
- 10:00 First connection timeout errors appear
- 10:01 Connection pool exhaustion detected

PREVENTION:
- Implement connection pool monitoring with proactive alerts
- Set up automated scaling for database connections
- Regular review of query performance and optimization
      `;

      mockEnv.AI.run.mockResolvedValue(mockLLMResponse);

      const result = await performRCA(mockIncident, mockGatheredData, mockEnv);

      expect(result).toBeDefined();
      expect(result.incident_id).toBe('incident-123');
      expect(result.root_cause).toContain('Database connection pool exhaustion');
      expect(result.confidence_score).toBe(0.85);
      expect(result.evidence).toHaveLength(3);
      expect(result.recommended_actions).toHaveLength(3);
      expect(mockEnv.logger.info).toHaveBeenCalledWith('Starting RCA analysis for incident incident-123');
    });

    test('should handle missing logs gracefully', async () => {
      const incompleteData: GatheredData = {
        logs: [], // Empty logs
        metrics: mockGatheredData.metrics,
        alerts: mockGatheredData.alerts,
        system_status: mockGatheredData.system_status,
        runbooks: mockGatheredData.runbooks
      };

      const mockLLMResponse = `
ROOT_CAUSE: Unable to determine specific root cause due to limited log data

EVIDENCE:
- Database connection count metric showing elevated values
- Critical alert for connection threshold breach

CONFIDENCE: 0.4

CONTRIBUTING_FACTORS:
- Insufficient log data for detailed analysis

RECOMMENDED_ACTIONS:
- investigate: Gather more detailed logs from affected services (autonomous_safe)

TIMELINE:
- 09:59 Database connection alert triggered

PREVENTION:
- Improve logging configuration for better incident analysis
      `;

      mockEnv.AI.run.mockResolvedValue(mockLLMResponse);

      const result = await performRCA(mockIncident, incompleteData, mockEnv);

      expect(result).toBeDefined();
      // Confidence score is reduced by our implementation due to missing data (0.4 - 0.1 = 0.3)
      expect(result.confidence_score).toBeCloseTo(0.3, 1);
      expect(result.root_cause).toContain('limited log data');
    });

    test('should handle completely undefined gathered data', async () => {
      const undefinedData: GatheredData = {
        logs: [],
        metrics: [],
        alerts: [],
        system_status: [],
        runbooks: []
      };

      const mockLLMResponse = `
ROOT_CAUSE: Insufficient data to determine root cause

EVIDENCE:
- No log, metric, or alert data available for analysis

CONFIDENCE: 0.1

CONTRIBUTING_FACTORS:
- Complete lack of observability data

RECOMMENDED_ACTIONS:
- gather_data: Collect logs, metrics, and alerts from affected services (autonomous_safe)

TIMELINE:
- Analysis attempted with no available data

PREVENTION:
- Implement comprehensive observability stack
- Ensure data collection systems are operational
      `;

      mockEnv.AI.run.mockResolvedValue(mockLLMResponse);

      const result = await performRCA(mockIncident, undefinedData, mockEnv);

      expect(result).toBeDefined();
      expect(result.confidence_score).toBe(0.1); // Already at minimum, no further reduction
      expect(result.evidence).toHaveLength(1);
      // We should expect warnings to be logged for incomplete data
      expect(mockEnv.logger.warn).toHaveBeenCalled();
    });

    test('should handle null/undefined gatheredData object gracefully', async () => {
      const nullData = null as any;

      await expect(performRCA(mockIncident, nullData, mockEnv))
        .rejects.toThrow(ProcessingError);
    });

    test('should handle AI model failures with fallback', async () => {
      mockEnv.AI.run
        .mockRejectedValueOnce(new Error('Primary model failed'))
        .mockResolvedValueOnce('ROOT_CAUSE: Fallback analysis\nEVIDENCE:\n- Limited analysis from fallback model\nCONFIDENCE: 0.3\nCONTRIBUTING_FACTORS:\n- Primary AI model unavailable\nRECOMMENDED_ACTIONS:\n- manual_review: Manual investigation required (requires_approval)\nTIMELINE:\n- Fallback analysis performed\nPREVENTION:\n- Ensure AI model availability');

      const result = await performRCA(mockIncident, mockGatheredData, mockEnv);

      expect(result).toBeDefined();
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Primary AI model failed: Primary model failed, falling back to simpler model')
      );
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(2);
    });

    test('should throw error when all AI models fail', async () => {
      mockEnv.AI.run
        .mockRejectedValueOnce(new Error('Primary model failed'))
        .mockRejectedValueOnce(new Error('Fallback model failed'));

      await expect(performRCA(mockIncident, mockGatheredData, mockEnv))
        .rejects.toThrow(ProcessingError);

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('All AI models failed during RCA analysis: Primary:')
      );
    });
  });

  describe('generateAnalysisPrompt', () => {
    test('should generate comprehensive prompt with all data sections', () => {
      const prompt = generateAnalysisPrompt(mockIncident, mockGatheredData);

      expect(prompt).toContain('INCIDENT ANALYSIS');
      expect(prompt).toContain('incident-123');
      expect(prompt).toContain('Database Connection Issues');
      expect(prompt).toContain('LOG DATA:');
      expect(prompt).toContain('METRIC DATA:');
      expect(prompt).toContain('ALERT DATA:');
      expect(prompt).toContain('SYSTEM STATUS:');
      expect(prompt).toContain('RELEVANT RUNBOOKS:');
    });

    test('should handle missing data gracefully in prompt', () => {
      const emptyData: GatheredData = {
        logs: [],
        metrics: [],
        alerts: [],
        system_status: [],
        runbooks: []
      };

      const prompt = generateAnalysisPrompt(mockIncident, emptyData);

      expect(prompt).toContain('LIMITED DATA AVAILABLE');
      expect(prompt).toContain('No log data available');
      expect(prompt).toContain('No metric data available');
      expect(prompt).toContain('No alert data available');
    });

    test('should add historical context when provided', () => {
      const context = ['Similar database issue resolved by restarting connection pool'];
      const prompt = generateAnalysisPrompt(mockIncident, mockGatheredData, context);

      expect(prompt).toContain('HISTORICAL CONTEXT:');
      expect(prompt).toContain('Similar database issue');
    });

    test('should adapt prompt based on incident type', () => {
      const memoryIncident = { ...mockIncident, title: 'Memory leak in service' };
      const prompt = generateAnalysisPrompt(memoryIncident, mockGatheredData);

      expect(prompt).toContain('ANALYSIS FOCUS: Memory-related issues');
      expect(prompt).toContain('heap usage');
    });
  });

  describe('parseRCAFromLLM', () => {
    test('should parse well-formed LLM response correctly', () => {
      const response = `
ROOT_CAUSE: Database connection pool exhaustion

EVIDENCE:
- Connection timeout errors in logs
- High connection count metrics
- Alert triggered for connection threshold

CONFIDENCE: 0.85

CONTRIBUTING_FACTORS:
- High traffic load
- Inefficient queries

RECOMMENDED_ACTIONS:
- restart: Restart database connection pool (autonomous_safe)
- scale_up: Increase pool size (requires_approval)

TIMELINE:
- 10:00 Alert triggered
- 10:01 Service degradation detected

PREVENTION:
- Monitor connection pool usage
- Implement auto-scaling
      `;

      const result = parseRCAFromLLM(response);

      expect(result.root_cause).toBe('Database connection pool exhaustion');
      expect(result.evidence).toHaveLength(3);
      expect(result.confidence_score).toBe(0.85);
      expect(result.contributing_factors).toHaveLength(2);
      expect(result.recommended_actions).toHaveLength(2);
      expect(result.analysis_timeline).toHaveLength(2);
      expect(result.prevention_strategies).toHaveLength(2);
    });

    test('should handle malformed LLM responses', () => {
      const malformedResponse = 'This is not a properly formatted response';

      expect(() => parseRCAFromLLM(malformedResponse))
        .toThrow(ProcessingError);
    });

    test('should handle missing required sections', () => {
      const incompleteResponse = `
EVIDENCE:
- Some evidence
CONFIDENCE: 0.5
      `;

      expect(() => parseRCAFromLLM(incompleteResponse))
        .toThrow('Failed to parse LLM response: missing required ROOT_CAUSE section');
    });

    test('should validate confidence score bounds', () => {
      const invalidResponse = `
ROOT_CAUSE: Some cause
CONFIDENCE: 1.5
      `;

      expect(() => parseRCAFromLLM(invalidResponse))
        .toThrow('Invalid confidence score: must be between 0 and 1');
    });
  });
});

describe('RCA Engine Model', () => {
  describe('validateRCAData', () => {
    test('should validate complete data successfully', () => {
      const result = validateRCAData(mockGatheredData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle missing logs', () => {
      const dataWithoutLogs = { ...mockGatheredData, logs: [] };
      const result = validateRCAData(dataWithoutLogs);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Insufficient log data - at least 1 log entry required');
    });

    test('should handle undefined logs', () => {
      const dataWithUndefinedLogs = { ...mockGatheredData, logs: undefined as any };
      const result = validateRCAData(dataWithUndefinedLogs);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Insufficient log data - at least 1 log entry required');
    });

    test('should handle missing metrics', () => {
      const dataWithoutMetrics = { ...mockGatheredData, metrics: [] };
      const result = validateRCAData(dataWithoutMetrics);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No metric data available for analysis');
    });

    test('should handle missing alerts', () => {
      const dataWithoutAlerts = { ...mockGatheredData, alerts: [] };
      const result = validateRCAData(dataWithoutAlerts);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No alert data available for correlation');
    });
  });

  describe('calculateConfidenceScore', () => {
    test('should return 0 for no evidence', () => {
      const score = calculateConfidenceScore([], 'database issue');
      expect(score).toBe(0);
    });

    test('should calculate score based on evidence count', () => {
      const evidence = ['error in logs', 'high CPU metrics'];
      const score = calculateConfidenceScore(evidence, 'performance issue');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should boost score for relevant evidence', () => {
      const evidence = ['database connection failed', 'connection timeout error'];
      const score = calculateConfidenceScore(evidence, 'database connection issue');
      expect(score).toBeGreaterThan(0.3);
    });

    test('should handle undefined evidence gracefully', () => {
      const score = calculateConfidenceScore(undefined as any, 'test hypothesis');
      expect(score).toBe(0);
    });
  });

  describe('rankRootCauseHypotheses', () => {
    test('should rank specific technical causes higher', () => {
      const hypotheses = [
        'Unknown issue',
        'Database connection timeout',
        'Memory exhausted',
        'General error'
      ];

      const ranked = rankRootCauseHypotheses(hypotheses);

      // Check that technical terms are ranked higher than generic ones
      // The exact order may vary based on scoring, but generic terms should be at the bottom
      expect(ranked[ranked.length - 1]).toMatch(/Unknown issue|General error/);
      expect(ranked.slice(0, 2)).toContain('Memory exhausted');
      expect(ranked.slice(0, 2)).toContain('Database connection timeout');
    });

    test('should handle empty or single hypothesis', () => {
      expect(rankRootCauseHypotheses([])).toEqual([]);
      expect(rankRootCauseHypotheses(['single'])).toEqual(['single']);
    });
  });

  describe('assessActionRisk', () => {
    test('should mark database actions as high risk', () => {
      const risk = assessActionRisk('delete from database', mockIncident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    test('should mark restart actions as safe', () => {
      const risk = assessActionRisk('restart service', mockIncident);
      expect(risk).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    test('should require approval for P0 config changes', () => {
      const p0Incident = { ...mockIncident, severity: IncidentSeverity.P0 };
      const risk = assessActionRisk('update configuration', p0Incident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });
  });

  describe('structureRCAResult', () => {
    test('should structure complete analysis correctly', () => {
      const analysis = {
        rootCause: 'Test cause',
        evidence: ['evidence1', 'evidence2', 'evidence3'],
        confidenceScore: 0.8,
        contributingFactors: ['factor1'],
        recommendedActions: [
          { type: 'restart', description: 'Restart service', risk_level: ActionRiskLevel.AUTONOMOUS_SAFE }
        ],
        timeline: ['event1'],
        prevention: ['prevention1']
      };

      const result = structureRCAResult('test-incident', analysis);

      expect(result.incident_id).toBe('test-incident');
      expect(result.root_cause).toBe('Test cause');
      expect(result.confidence_score).toBe(0.8);
      expect(result.recommended_actions).toHaveLength(1);
    });

    test('should validate confidence scores', () => {
      const analysis = { confidenceScore: 1.5 };

      expect(() => structureRCAResult('test', analysis))
        .toThrow('Confidence score must be between 0 and 1');
    });

    test('should validate evidence for high confidence scores', () => {
      const analysis = {
        confidenceScore: 0.9,
        evidence: ['only one piece']
      };

      expect(() => structureRCAResult('test', analysis))
        .toThrow('High confidence scores require at least 3 pieces of evidence');
    });
  });
});