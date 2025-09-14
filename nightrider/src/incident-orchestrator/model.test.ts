import * as Model from './model';
import {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  RecommendedAction,
  ActionRiskLevel,
  ProcessingResult,
  ValidationError,
  ProcessingError
} from '../types/shared';

describe('IncidentOrchestrator Model', () => {
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

  const mockAction: RecommendedAction = {
    action_type: 'restart_service',
    description: 'Restart database connection pool',
    risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
    target: 'api-service',
    estimated_impact: 'low'
  };

  describe('validateWorkflowState', () => {
    it('should allow valid state transitions', () => {
      expect(Model.validateWorkflowState(IncidentStatus.RECEIVED, IncidentStatus.INVESTIGATING)).toBe(true);
      expect(Model.validateWorkflowState(IncidentStatus.INVESTIGATING, IncidentStatus.ANALYZING)).toBe(true);
      expect(Model.validateWorkflowState(IncidentStatus.ANALYZING, IncidentStatus.REMEDIATING)).toBe(true);
      expect(Model.validateWorkflowState(IncidentStatus.REMEDIATING, IncidentStatus.RESOLVED)).toBe(true);
    });

    it('should allow escalation from any state', () => {
      expect(Model.validateWorkflowState(IncidentStatus.RECEIVED, IncidentStatus.ESCALATED)).toBe(true);
      expect(Model.validateWorkflowState(IncidentStatus.INVESTIGATING, IncidentStatus.ESCALATED)).toBe(true);
      expect(Model.validateWorkflowState(IncidentStatus.ANALYZING, IncidentStatus.ESCALATED)).toBe(true);
    });

    it('should reject invalid state transitions', () => {
      expect(Model.validateWorkflowState(IncidentStatus.RESOLVED, IncidentStatus.INVESTIGATING)).toBe(false);
      expect(Model.validateWorkflowState(IncidentStatus.REMEDIATING, IncidentStatus.RECEIVED)).toBe(false);
    });

    it('should allow staying in same state', () => {
      expect(Model.validateWorkflowState(IncidentStatus.INVESTIGATING, IncidentStatus.INVESTIGATING)).toBe(true);
    });
  });

  describe('calculateRiskLevel', () => {
    it('should calculate AUTONOMOUS_SAFE for low-risk actions', () => {
      const lowRiskAction = { ...mockAction, action_type: 'restart_service' };
      expect(Model.calculateRiskLevel(lowRiskAction)).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    it('should calculate REQUIRES_APPROVAL for high-risk actions', () => {
      const highRiskAction = { ...mockAction, action_type: 'delete_data', target: 'production-database' };
      expect(Model.calculateRiskLevel(highRiskAction)).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    it('should consider production targets as high-risk', () => {
      const prodAction = { ...mockAction, target: 'prod-api-service' };
      expect(Model.calculateRiskLevel(prodAction)).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
    });

    it('should consider destructive actions as high-risk', () => {
      const destructiveActions = ['delete', 'drop', 'destroy', 'terminate'];
      destructiveActions.forEach(actionType => {
        const action = { ...mockAction, action_type: actionType };
        expect(Model.calculateRiskLevel(action)).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
      });
    });
  });

  describe('shouldEscalate', () => {
    it('should escalate P0 incidents after 2 minutes', () => {
      const p0Incident = { ...mockIncident, severity: IncidentSeverity.P0 };
      expect(Model.shouldEscalate(p0Incident, 3 * 60 * 1000)).toBe(true); // 3 minutes
      expect(Model.shouldEscalate(p0Incident, 1 * 60 * 1000)).toBe(false); // 1 minute
    });

    it('should escalate P1 incidents after 5 minutes', () => {
      const p1Incident = { ...mockIncident, severity: IncidentSeverity.P1 };
      expect(Model.shouldEscalate(p1Incident, 6 * 60 * 1000)).toBe(true); // 6 minutes
      expect(Model.shouldEscalate(p1Incident, 4 * 60 * 1000)).toBe(false); // 4 minutes
    });

    it('should not escalate P2/P3 incidents based on time alone', () => {
      const p2Incident = { ...mockIncident, severity: IncidentSeverity.P2 };
      const p3Incident = { ...mockIncident, severity: IncidentSeverity.P3 };

      expect(Model.shouldEscalate(p2Incident, 10 * 60 * 1000)).toBe(false);
      expect(Model.shouldEscalate(p3Incident, 30 * 60 * 1000)).toBe(false);
    });

    it('should escalate after 3 failed attempts regardless of severity', () => {
      const incidentWithFailures = {
        ...mockIncident,
        metadata: { ...mockIncident.metadata, failed_attempts: 3 }
      };
      expect(Model.shouldEscalate(incidentWithFailures, 30000)).toBe(true); // 30 seconds
    });
  });

  describe('validateIncidentData', () => {
    it('should validate complete incident data', () => {
      const result = Model.validateIncidentData(mockIncident);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should catch missing required fields', () => {
      const invalidIncident = { ...mockIncident, id: '', title: '' };
      const result = Model.validateIncidentData(invalidIncident);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('id is required');
      expect(result.errors).toContain('title is required');
    });

    it('should validate severity values', () => {
      const invalidIncident = { ...mockIncident, severity: 'invalid' as IncidentSeverity };
      const result = Model.validateIncidentData(invalidIncident);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('severity must be one of: P0, P1, P2, P3');
    });

    it('should validate affected_services array', () => {
      const invalidIncident = { ...mockIncident, affected_services: [] };
      const result = Model.validateIncidentData(invalidIncident);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('at least one affected service is required');
    });

    it('should validate timestamp format', () => {
      const invalidIncident = { ...mockIncident, created_at: 'invalid-date' };
      const result = Model.validateIncidentData(invalidIncident);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('created_at must be valid ISO 8601 date');
    });
  });

  describe('formatProcessingResult', () => {
    it('should format successful result', () => {
      const rawResult = {
        status: 'completed',
        analysis: { root_cause: 'Database connection timeout', confidence_score: 0.95 },
        actions: ['restart_service', 'increase_timeout'],
        timeline: ['10:00 - Alert received', '10:02 - Analysis started']
      };

      const formatted = Model.formatProcessingResult(rawResult);

      expect(formatted.status).toBe('completed');
      expect(formatted.actions_taken).toEqual(['restart_service', 'increase_timeout']);
      expect(formatted.timeline).toEqual(['10:00 - Alert received', '10:02 - Analysis started']);
      expect(formatted.agent_analysis).toBeDefined();
    });

    it('should handle partial results gracefully', () => {
      const partialResult = {
        status: 'in_progress'
      };

      const formatted = Model.formatProcessingResult(partialResult);

      expect(formatted.status).toBe('in_progress');
      expect(formatted.actions_taken).toEqual([]);
      expect(formatted.timeline).toEqual([]);
    });

    it('should validate result status', () => {
      const invalidResult = {
        status: 'invalid_status'
      };

      expect(() => Model.formatProcessingResult(invalidResult)).toThrow(ProcessingError);
    });
  });

  describe('Business Rules', () => {
    it('should enforce P0 processing time limits', () => {
      const p0Incident = { ...mockIncident, severity: IncidentSeverity.P0 };
      const result = Model.validateProcessingTime(p0Incident, 3 * 60 * 1000); // 3 minutes
      expect(result.withinLimits).toBe(false);
      expect(result.escalationRequired).toBe(true);
    });

    it('should enforce P1 processing time limits', () => {
      const p1Incident = { ...mockIncident, severity: IncidentSeverity.P1 };
      const result = Model.validateProcessingTime(p1Incident, 6 * 60 * 1000); // 6 minutes
      expect(result.withinLimits).toBe(false);
      expect(result.escalationRequired).toBe(true);
    });

    it('should allow autonomous actions only for safe operations', () => {
      const safeAction = { ...mockAction, risk_level: ActionRiskLevel.AUTONOMOUS_SAFE };
      expect(Model.canExecuteAutonomously(safeAction)).toBe(true);

      const dangerousAction = { ...mockAction, risk_level: ActionRiskLevel.REQUIRES_APPROVAL };
      expect(Model.canExecuteAutonomously(dangerousAction)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw ValidationError for invalid workflow states', () => {
      expect(() => Model.validateWorkflowState('invalid', IncidentStatus.INVESTIGATING))
        .toThrow(ValidationError);
    });

    it('should throw ProcessingError for business rule violations', () => {
      const violatingAction = { ...mockAction, action_type: 'drop_database', target: 'production' };
      expect(() => Model.enforceBusinessRules(violatingAction))
        .toThrow(ProcessingError);
    });
  });
});