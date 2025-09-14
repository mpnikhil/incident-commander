import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as Controller from './controller';
import {
  RecommendedAction,
  ActionRiskLevel,
  Incident,
  IncidentStatus,
  IncidentSeverity,
  RemediationExecutedEvent,
  NotificationEvent,
  ValidationError,
  ProcessingError
} from '../types/shared';

// Mock environment
const createMockEnv = () => ({
  AI: {
    run: vi.fn().mockResolvedValue('{"success": true}')
  },
  INCIDENT_DATA: {
    updateIncident: vi.fn(),
    getIncident: vi.fn()
  },
  NOTIFICATION_QUEUE: {
    send: vi.fn()
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  _raindrop: { app: {} },
  annotation: {},
  CONVERSATION_MEMORY: {},
  KNOWLEDGE_BASE: {},
  INCIDENT_ORCHESTRATOR: {},
  RCA_ENGINE: {},
  SRE_API: {},
  tracer: {}
});

// Test data
const mockIncident: Incident = {
  id: 'INC-001',
  title: 'Service Down',
  description: 'Payment service is experiencing downtime',
  severity: IncidentSeverity.P0,
  status: IncidentStatus.ANALYZING,
  source: 'prometheus',
  affected_services: ['payment-service'],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:01:00Z',
  metadata: {}
};

const autonomousAction: RecommendedAction = {
  action_type: 'restart_service',
  description: 'Restart payment service',
  risk_level: ActionRiskLevel.AUTONOMOUS_SAFE,
  target: 'payment-service',
  estimated_impact: 'Low risk - standard restart procedure'
};

const approvalRequiredAction: RecommendedAction = {
  action_type: 'scale_database',
  description: 'Scale database to handle increased load',
  risk_level: ActionRiskLevel.REQUIRES_APPROVAL,
  target: 'payment-db',
  estimated_impact: 'Medium risk - requires approval'
};

describe('RemediationCoordinator', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  describe('executeRemediation', () => {
    test('should execute autonomous safe actions immediately', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      expect(result.success).toBe(true);
      expect(result.executed_actions).toContain('restart_service');
      expect(result.failed_actions).toHaveLength(0);
      expect(mockEnv.INCIDENT_DATA.updateIncident).toHaveBeenCalledWith(
        mockIncident.id,
        expect.objectContaining({ status: IncidentStatus.REMEDIATING })
      );
      expect(mockEnv.NOTIFICATION_QUEUE.send).toHaveBeenCalled();
    });

    test('should request approval for high-risk actions', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);

      const result = await Controller.executeRemediation([approvalRequiredAction], mockIncident, mockEnv);

      expect(result.success).toBe(true); // Success because approval was requested (partial success)
      expect(result.executed_actions).toHaveLength(0);
      expect(result.pending_approval).toContain('scale_database');
      expect(mockEnv.NOTIFICATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'notification',
          subject: expect.stringContaining('Approval Required')
        })
      );
    });

    test('should handle mixed action types correctly', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });

      const result = await Controller.executeRemediation(
        [autonomousAction, approvalRequiredAction],
        mockIncident,
        mockEnv
      );

      expect(result.executed_actions).toContain('restart_service');
      expect(result.pending_approval).toContain('scale_database');
      expect(result.success).toBe(true); // Partial success
    });

    test('should handle action execution failures with proper error handling', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });
      // Simulate SRE MCP failure by throwing error during action execution
      mockEnv.AI.run.mockRejectedValue(new Error('MCP connection failed'));

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      expect(result.success).toBe(false);
      expect(result.failed_actions).toContain('restart_service');
      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to execute action'),
        expect.any(Object)
      );
    });

    test('should implement retry logic for transient failures', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });

      // Reset the mock and configure it fresh for this test
      mockEnv.AI.run.mockReset();
      mockEnv.AI.run
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockResolvedValue('{"success": true, "message": "Action completed"}');

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      expect(result.success).toBe(true);
      expect(result.executed_actions).toContain('restart_service');
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    test('should respect business rules for restart action limits', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue({
        ...mockIncident,
        metadata: { restart_attempts: 3 } // Already at limit
      });

      const restartAction = {
        ...autonomousAction,
        action_type: 'restart_service'
      };

      const result = await Controller.executeRemediation([restartAction], mockIncident, mockEnv);

      expect(result.success).toBe(false);
      expect(result.failed_actions).toContain('restart_service');
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Restart limit exceeded'),
        expect.any(Object)
      );
    });

    test('should validate actions before execution', async () => {
      const invalidAction = {
        ...autonomousAction,
        action_type: '', // Invalid action type
        target: '' // Invalid target
      };

      const result = await Controller.executeRemediation([invalidAction], mockIncident, mockEnv);

      expect(result.success).toBe(false);
      expect(result.failed_actions).toHaveLength(1);
      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed'),
        expect.any(Object)
      );
    });

    test('should send appropriate notifications for different scenarios', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });

      await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      // Check for execution notification
      expect(mockEnv.NOTIFICATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'remediation_executed',
          incident_id: mockIncident.id,
          action: autonomousAction
        } as RemediationExecutedEvent)
      );
    });

    test('should handle empty action array gracefully', async () => {
      const result = await Controller.executeRemediation([], mockIncident, mockEnv);

      expect(result.success).toBe(true);
      expect(result.executed_actions).toHaveLength(0);
      expect(result.failed_actions).toHaveLength(0);
      expect(result.pending_approval).toHaveLength(0);
    });

    test('should properly assess execution risk for different action types', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);

      const dbAction = {
        ...autonomousAction,
        action_type: 'database_operation',
        description: 'Execute database query',
        risk_level: ActionRiskLevel.AUTONOMOUS_SAFE // Start with safe to test risk assessment
      };

      const result = await Controller.executeRemediation([dbAction], mockIncident, mockEnv);

      // DB operations should require approval per business rules
      expect(result.pending_approval).toContain('database_operation');
    });

    test('should implement rollback on execution failure', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      // Mock successful execution followed by verification failure
      mockEnv.AI.run
        .mockResolvedValueOnce('{"success": true, "message": "Action executed"}')
        .mockRejectedValueOnce(new Error('Verification failed'));

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Action verification failed'),
        expect.any(Object)
      );
    });
  });

  describe('executeAutonomousActions', () => {
    test('should filter and execute only autonomous safe actions', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });

      const result = await Controller.executeAutonomousActions([
        autonomousAction,
        approvalRequiredAction
      ], mockEnv);

      expect(result.executed_actions).toContain('restart_service');
      expect(result.executed_actions).not.toContain('scale_database');
      expect(result.skipped_actions).toContain('scale_database');
    });
  });

  describe('requestApprovalForActions', () => {
    test('should send approval request notification', async () => {
      const result = await Controller.requestApprovalForActions([approvalRequiredAction], mockIncident, mockEnv);

      expect(result.approval_requested).toBe(true);
      expect(result.actions_pending_approval).toContain('scale_database');
      expect(mockEnv.NOTIFICATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'notification',
          subject: expect.stringContaining('Approval Required'),
          body: expect.stringContaining('scale_database')
        } as NotificationEvent)
      );
    });
  });

  describe('monitorActionResults', () => {
    test('should check action status and return result', async () => {
      const executionId = 'exec-123';

      const result = await Controller.monitorActionResults(executionId, mockEnv);

      expect(result.execution_id).toBe(executionId);
      expect(result.status).toBeDefined();
      expect(['completed', 'in_progress', 'failed']).toContain(result.status);
    });
  });

  describe('executeRollback', () => {
    test('should execute rollback for failed action', async () => {
      const reason = 'Action verification failed';

      const result = await Controller.executeRollback(autonomousAction, reason, mockEnv);

      expect(result.rollback_successful).toBeDefined();
      expect(result.rollback_actions).toBeDefined();
      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Executing rollback'),
        expect.any(Object)
      );
    });
  });

  describe('Error scenarios', () => {
    test('should handle service unavailability gracefully', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockRejectedValue(new Error('Service unavailable'));

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      expect(result.success).toBe(false);
      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update incident status'),
        expect.any(Object)
      );
    });

    test('should handle notification queue failures without blocking execution', async () => {
      mockEnv.INCIDENT_DATA.getIncident.mockResolvedValue(mockIncident);
      mockEnv.INCIDENT_DATA.updateIncident.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.REMEDIATING
      });
      mockEnv.NOTIFICATION_QUEUE.send.mockRejectedValue(new Error('Queue unavailable'));

      // Reset AI mock for this test
      mockEnv.AI.run.mockReset();
      mockEnv.AI.run.mockResolvedValue('{"success": true, "message": "Action completed"}');

      const result = await Controller.executeRemediation([autonomousAction], mockIncident, mockEnv);

      // Execution should still succeed even if notifications fail
      expect(result.success).toBe(true);
      expect(result.executed_actions).toContain('restart_service');
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send execution notification'),
        expect.any(Object)
      );
    });
  });
});