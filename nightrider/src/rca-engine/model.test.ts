import { describe, expect, test } from 'vitest';
import {
  validateRCAData,
  calculateConfidenceScore,
  rankRootCauseHypotheses,
  assessActionRisk,
  structureRCAResult
} from './model';
import {
  GatheredData,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  ActionRiskLevel,
  RCAResult,
  ValidationError
} from '../types/shared';

describe('RCA Engine Model', () => {
  const mockIncident: Incident = {
    id: 'inc-001',
    title: 'Database Connection Issues',
    description: 'Users unable to connect to the main database',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.INVESTIGATING,
    source: 'monitoring',
    affected_services: ['api-service', 'user-service'],
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:30:00Z',
    metadata: { region: 'us-east-1' }
  };

  const mockGatheredData: GatheredData = {
    logs: [
      {
        timestamp: '2025-01-15T10:00:00Z',
        service: 'api-service',
        level: 'ERROR',
        message: 'Connection timeout to database',
        metadata: { connection_id: 'conn-123' }
      },
      {
        timestamp: '2025-01-15T10:01:00Z',
        service: 'user-service',
        level: 'ERROR',
        message: 'Failed to establish database connection'
      }
    ],
    metrics: [
      {
        metric_name: 'database.connection_pool.active',
        timestamp: '2025-01-15T10:00:00Z',
        value: 0,
        labels: { database: 'primary' }
      }
    ],
    alerts: [
      {
        id: 'alert-001',
        severity: 'critical',
        trigger_condition: 'database_connections < 1',
        timestamp: '2025-01-15T09:59:00Z',
        service: 'database',
        status: 'firing'
      }
    ],
    system_status: [
      {
        service: 'database',
        status: 'down',
        dependencies: ['storage'],
        health_checks: { ping: false, query: false }
      }
    ],
    runbooks: [
      {
        id: 'rb-001',
        title: 'Database Connection Recovery',
        content: 'Steps to recover database connections',
        incident_types: ['database', 'connection'],
        procedures: ['restart_service', 'check_connections']
      }
    ]
  };

  describe('validateRCAData', () => {
    test('should validate sufficient data with logs, metrics, and alerts', () => {
      const result = validateRCAData(mockGatheredData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject data with empty logs', () => {
      const invalidData = { ...mockGatheredData, logs: [] };
      const result = validateRCAData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Insufficient log data - at least 1 log entry required');
    });

    test('should reject data with no metrics', () => {
      const invalidData = { ...mockGatheredData, metrics: [] };
      const result = validateRCAData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No metric data available for analysis');
    });

    test('should reject data with no alerts', () => {
      const invalidData = { ...mockGatheredData, alerts: [] };
      const result = validateRCAData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No alert data available for correlation');
    });

    test('should accept data with minimal valid requirements', () => {
      const minimalData: GatheredData = {
        logs: [mockGatheredData.logs[0]],
        metrics: [mockGatheredData.metrics[0]],
        alerts: [mockGatheredData.alerts[0]],
        system_status: [],
        runbooks: []
      };
      const result = validateRCAData(minimalData);
      expect(result.isValid).toBe(true);
    });
  });

  describe('calculateConfidenceScore', () => {
    test('should return high confidence for strong evidence', () => {
      const evidence = [
        'Database connection timeout in logs',
        'Connection pool metrics showing 0 active connections',
        'Critical alert triggered for database connectivity',
        'System health checks failing for database service',
        'Multiple services reporting same connection error'
      ];
      const hypothesis = 'Database server is down or unreachable';
      const score = calculateConfidenceScore(evidence, hypothesis);
      expect(score).toBeGreaterThanOrEqual(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    test('should return medium confidence for moderate evidence', () => {
      const evidence = [
        'Some connection errors in logs',
        'Metrics showing degraded performance',
        'One alert triggered'
      ];
      const hypothesis = 'Database performance issues';
      const score = calculateConfidenceScore(evidence, hypothesis);
      expect(score).toBeGreaterThanOrEqual(0.5);
      expect(score).toBeLessThan(0.8);
    });

    test('should return low confidence for weak evidence', () => {
      const evidence = [
        'Single log entry with error',
        'No metric correlation'
      ];
      const hypothesis = 'Database connection issues';
      const score = calculateConfidenceScore(evidence, hypothesis);
      expect(score).toBeLessThan(0.5);
    });

    test('should return minimum score for no evidence', () => {
      const evidence: string[] = [];
      const hypothesis = 'Unknown issue';
      const score = calculateConfidenceScore(evidence, hypothesis);
      expect(score).toBe(0.0);
    });

    test('should consider evidence relevance to hypothesis', () => {
      const relevantEvidence = [
        'Database connection timeout',
        'Connection pool exhausted',
        'Database health check failed'
      ];
      const irrelevantEvidence = [
        'Frontend UI slow to load',
        'Email service working normally',
        'CDN performance good'
      ];
      const hypothesis = 'Database connectivity issue';

      const relevantScore = calculateConfidenceScore(relevantEvidence, hypothesis);
      const irrelevantScore = calculateConfidenceScore(irrelevantEvidence, hypothesis);

      expect(relevantScore).toBeGreaterThan(irrelevantScore);
    });
  });

  describe('rankRootCauseHypotheses', () => {
    test('should rank specific technical causes higher than generic ones', () => {
      const hypotheses = [
        'Unknown system error',
        'Database connection pool exhausted',
        'Network connectivity issue',
        'Database server crashed',
        'General performance degradation'
      ];

      const ranked = rankRootCauseHypotheses(hypotheses);

      expect(ranked[0]).toBe('Database server crashed');
      expect(ranked[1]).toBe('Database connection pool exhausted');
      expect(ranked.indexOf('Unknown system error')).toBeGreaterThan(2);
    });

    test('should prioritize infrastructure causes over application causes', () => {
      const hypotheses = [
        'Application memory leak',
        'Server hardware failure',
        'Code deployment bug',
        'Network infrastructure failure'
      ];

      const ranked = rankRootCauseHypotheses(hypotheses);

      const infraIndices = ranked.map((h, i) =>
        h.includes('hardware') || h.includes('infrastructure') ? i : -1
      ).filter(i => i >= 0);

      const appIndices = ranked.map((h, i) =>
        h.includes('application') || h.includes('code') || h.includes('memory') ? i : -1
      ).filter(i => i >= 0);

      expect(Math.min(...infraIndices)).toBeLessThan(Math.max(...appIndices));
    });

    test('should handle empty hypotheses list', () => {
      const result = rankRootCauseHypotheses([]);
      expect(result).toEqual([]);
    });

    test('should maintain original list if single hypothesis', () => {
      const hypotheses = ['Single hypothesis'];
      const result = rankRootCauseHypotheses(hypotheses);
      expect(result).toEqual(['Single hypothesis']);
    });
  });

  describe('assessActionRisk', () => {
    test('should classify restart actions as autonomous safe', () => {
      const risk = assessActionRisk('restart_service', mockIncident);
      expect(risk).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    test('should classify scale actions as autonomous safe for non-critical incidents', () => {
      const nonCriticalIncident = { ...mockIncident, severity: IncidentSeverity.P2 };
      const risk = assessActionRisk('scale_up_instances', nonCriticalIncident);
      expect(risk).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    test('should require approval for database changes', () => {
      const risk = assessActionRisk('modify_database_schema', mockIncident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    test('should require approval for data deletion', () => {
      const risk = assessActionRisk('delete_corrupted_data', mockIncident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    test('should require approval for configuration changes in P0 incidents', () => {
      const criticalIncident = { ...mockIncident, severity: IncidentSeverity.P0 };
      const risk = assessActionRisk('update_configuration', criticalIncident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    test('should allow configuration changes for lower severity incidents', () => {
      const lowSeverityIncident = { ...mockIncident, severity: IncidentSeverity.P3 };
      const risk = assessActionRisk('update_configuration', lowSeverityIncident);
      expect(risk).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    test('should require approval for network changes', () => {
      const risk = assessActionRisk('modify_firewall_rules', mockIncident);
      expect(risk).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });
  });

  describe('structureRCAResult', () => {
    test('should structure complete RCA analysis into proper format', () => {
      const analysis = {
        rootCause: 'Database connection pool exhausted',
        evidence: [
          'Connection timeout errors in logs',
          'Connection pool metrics showing 0 available connections',
          'Multiple services unable to connect to database'
        ],
        confidenceScore: 0.85,
        contributingFactors: [
          'High traffic load during peak hours',
          'Connection pool size not optimized for current load'
        ],
        recommendedActions: [
          {
            type: 'restart_service',
            description: 'Restart database connection pool',
            target: 'database',
            impact: 'Immediate connection restoration',
            risk_level: ActionRiskLevel.AUTONOMOUS_SAFE
          },
          {
            type: 'scale_up',
            description: 'Increase connection pool size',
            target: 'database-config',
            impact: 'Prevent future connection exhaustion',
            risk_level: ActionRiskLevel.AUTONOMOUS_SAFE
          }
        ],
        timeline: [
          '10:00:00 - Connection errors started',
          '10:01:00 - Multiple services affected',
          '10:02:00 - Connection pool exhausted'
        ],
        prevention: [
          'Implement connection pool monitoring',
          'Set up automated pool scaling'
        ]
      };

      const result = structureRCAResult(mockIncident.id, analysis);

      expect(result.incident_id).toBe(mockIncident.id);
      expect(result.root_cause).toBe('Database connection pool exhausted');
      expect(result.evidence).toHaveLength(3);
      expect(result.confidence_score).toBe(0.85);
      expect(result.contributing_factors).toHaveLength(2);
      expect(result.recommended_actions).toHaveLength(2);
      expect(result.recommended_actions[0].risk_level).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
      expect(result.analysis_timeline).toHaveLength(3);
      expect(result.prevention_strategies).toHaveLength(2);
    });

    test('should handle minimal analysis data', () => {
      const minimalAnalysis = {
        rootCause: 'Service unavailable',
        evidence: ['Service down'],
        confidenceScore: 0.5,
        contributingFactors: [],
        recommendedActions: [],
        timeline: [],
        prevention: []
      };

      const result = structureRCAResult(mockIncident.id, minimalAnalysis);

      expect(result.incident_id).toBe(mockIncident.id);
      expect(result.root_cause).toBe('Service unavailable');
      expect(result.evidence).toEqual(['Service down']);
      expect(result.confidence_score).toBe(0.5);
      expect(result.contributing_factors).toEqual([]);
      expect(result.recommended_actions).toEqual([]);
    });

    test('should validate confidence score bounds', () => {
      const analysis = {
        rootCause: 'Test issue',
        evidence: ['Evidence'],
        confidenceScore: 1.2, // Invalid score > 1
        contributingFactors: [],
        recommendedActions: [],
        timeline: [],
        prevention: []
      };

      expect(() => structureRCAResult(mockIncident.id, analysis))
        .toThrow('Confidence score must be between 0 and 1');
    });

    test('should require minimum evidence for high confidence scores', () => {
      const analysis = {
        rootCause: 'High confidence claim',
        evidence: ['Single piece of evidence'], // Not enough for high confidence
        confidenceScore: 0.9,
        contributingFactors: [],
        recommendedActions: [],
        timeline: [],
        prevention: []
      };

      expect(() => structureRCAResult(mockIncident.id, analysis))
        .toThrow('High confidence scores require at least 3 pieces of evidence');
    });
  });
});

// Test data interfaces
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}