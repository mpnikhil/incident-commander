import { expect, describe, it, beforeEach } from 'vitest';
import { IncidentData } from './index.js';
import { Env } from './raindrop.gen.js';
import {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentAlert,
  IncidentEvent,
  ValidationError,
  NotFoundError
} from '../types/shared.js';

// Mock environment for testing
const createMockEnv = (): Env => ({
  _raindrop: {
    app: {} as any
  },
  AI: {} as any,
  annotation: {} as any,
  CONVERSATION_MEMORY: {} as any,
  INCIDENT_DATA: {} as any,
  INCIDENT_ORCHESTRATOR: {} as any,
  KNOWLEDGE_BASE: {} as any,
  logger: {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  } as any,
  NOTIFICATION_QUEUE: {} as any,
  RCA_ENGINE: {} as any,
  REMEDIATION_COORDINATOR: {} as any,
  SRE_API: {} as any,
  tracer: {} as any
});

// Mock actor state
const createMockState = () => ({
  storage: {},
  blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
  id: () => ({ toString: () => 'test-id' }),
  acceptWebSocket: () => ({} as any),
  getWebSockets: () => [] as any[]
});

describe('IncidentData Actor', () => {
  let actor: IncidentData;
  let mockEnv: Env;
  let mockState: any;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockState = createMockState();
    actor = new IncidentData(mockState, mockEnv);
  });

  describe('createIncident', () => {
    it('should create a new incident with valid data', async () => {
      const alert: IncidentAlert = {
        source: 'monitoring-system',
        alert_type: 'service_down',
        severity: 'P0',
        message: 'API service is down',
        affected_services: ['api-service'],
        timestamp: new Date().toISOString(),
        metadata: { region: 'us-west-2' }
      };

      const result = await actor.createIncident(alert);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^inc-\d+-[a-f0-9]+$/);
      expect(result.title).toBe(alert.message);
      expect(result.severity).toBe(IncidentSeverity.P0);
      expect(result.status).toBe(IncidentStatus.RECEIVED);
      expect(result.source).toBe(alert.source);
      expect(result.affected_services).toEqual(alert.affected_services);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should validate required fields', async () => {
      const invalidAlert: any = {
        source: 'test',
        // missing required fields
      };

      await expect(actor.createIncident(invalidAlert)).rejects.toThrow(ValidationError);
    });

    it('should classify severity correctly', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'degraded_performance',
        severity: 'P2',
        message: 'Slow response times',
        affected_services: ['api-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const result = await actor.createIncident(alert);
      expect(result.severity).toBe(IncidentSeverity.P2);
    });
  });

  describe('getIncident', () => {
    it('should retrieve an existing incident', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const created = await actor.createIncident(alert);
      const retrieved = await actor.getIncident(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent incident', async () => {
      const result = await actor.getIncident('non-existent-id');
      expect(result).toBeNull();
    });

    it('should be callable via RPC (external service binding)', async () => {
      // This test verifies that getIncident can be called externally
      // The method should exist and be properly exposed for RPC calls
      expect(typeof actor.getIncident).toBe('function');
      expect(actor.getIncident.length).toBe(1); // expects 1 parameter
    });
  });

  describe('updateIncidentStatus', () => {
    it('should update incident status with valid transition', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);
      await actor.updateIncidentStatus(incident.id, IncidentStatus.INVESTIGATING);

      const updated = await actor.getIncident(incident.id);
      expect(updated!.status).toBe(IncidentStatus.INVESTIGATING);
      expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(new Date(incident.updated_at).getTime());
    });

    it('should validate state transitions', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);

      // Invalid transition: RECEIVED -> RESOLVED (should go through intermediate states)
      await expect(
        actor.updateIncidentStatus(incident.id, IncidentStatus.RESOLVED)
      ).rejects.toThrow('Invalid state transition');
    });

    it('should throw NotFoundError for non-existent incident', async () => {
      await expect(
        actor.updateIncidentStatus('non-existent-id', IncidentStatus.INVESTIGATING)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateIncident', () => {
    it('should update incident fields', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);
      const updates = {
        title: 'Updated title',
        description: 'Updated description'
      };

      const updated = await actor.updateIncident(incident.id, updates);
      expect(updated!.title).toBe('Updated title');
      expect(updated!.description).toBe('Updated description');
    });

    it('should return null for non-existent incident', async () => {
      const result = await actor.updateIncident('non-existent-id', { title: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('getIncidentHistory', () => {
    it('should return timeline events for incident', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);
      await actor.addTimelineEvent(incident.id, 'Incident created');
      await actor.updateIncidentStatus(incident.id, IncidentStatus.INVESTIGATING);
      await actor.addTimelineEvent(incident.id, 'Investigation started');

      const history = await actor.getIncidentHistory(incident.id);
      expect(history).toHaveLength(3); // created + event + status change
      expect(history[0].event).toBe('Incident created');
      expect(history[2].event).toBe('Investigation started');
    });

    it('should return empty array for non-existent incident', async () => {
      const history = await actor.getIncidentHistory('non-existent-id');
      expect(history).toEqual([]);
    });
  });

  describe('addTimelineEvent', () => {
    it('should add timeline event to existing incident', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Test incident',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);
      await actor.addTimelineEvent(incident.id, 'Custom event occurred');

      const history = await actor.getIncidentHistory(incident.id);
      const customEvent = history.find(e => e.event === 'Custom event occurred');
      expect(customEvent).toBeDefined();
      expect(customEvent!.timestamp).toBeDefined();
    });

    it('should throw error for non-existent incident', async () => {
      await expect(
        actor.addTimelineEvent('non-existent-id', 'test event')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('checkEscalationThresholds', () => {
    it('should identify incidents requiring escalation', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P0',
        message: 'Critical incident',
        affected_services: ['critical-service'],
        timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 minutes ago
        metadata: {}
      };

      const incident = await actor.createIncident(alert);

      // Mock the created time to be 6 minutes ago (P0 escalates after 5 minutes)
      const storage = mockState.storage;
      storage[incident.id].created_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();

      const escalationCandidates = await actor.checkEscalationThresholds();
      expect(escalationCandidates).toHaveLength(1);
      expect(escalationCandidates[0].id).toBe(incident.id);
    });

    it('should not escalate resolved incidents', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P0',
        message: 'Critical incident',
        affected_services: ['critical-service'],
        timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        metadata: {}
      };

      const incident = await actor.createIncident(alert);
      await actor.updateIncidentStatus(incident.id, IncidentStatus.INVESTIGATING);
      await actor.updateIncidentStatus(incident.id, IncidentStatus.ANALYZING);
      await actor.updateIncidentStatus(incident.id, IncidentStatus.REMEDIATING);
      await actor.updateIncidentStatus(incident.id, IncidentStatus.RESOLVED);

      const escalationCandidates = await actor.checkEscalationThresholds();
      expect(escalationCandidates).toHaveLength(0);
    });
  });

  describe('listIncidents', () => {
    it('should return all incidents', async () => {
      const alert1: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'First incident',
        affected_services: ['service1'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const alert2: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P2',
        message: 'Second incident',
        affected_services: ['service2'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      await actor.createIncident(alert1);
      await actor.createIncident(alert2);

      const incidents = await actor.listIncidents();
      expect(incidents).toHaveLength(2);
      expect(incidents.map(i => i.title).sort()).toEqual(['First incident', 'Second incident']);
    });

    it('should return empty array when no incidents exist', async () => {
      const incidents = await actor.listIncidents();
      expect(incidents).toEqual([]);
    });
  });

  describe('RPC Method Exposure', () => {
    it('should expose all required methods for RPC calls', () => {
      // Verify all methods that should be callable via service bindings exist
      const expectedMethods = [
        'createIncident',
        'getIncident',
        'updateIncident',
        'updateIncidentStatus',
        'listIncidents',
        'getIncidentHistory',
        'addTimelineEvent',
        'checkEscalationThresholds'
      ];

      expectedMethods.forEach(methodName => {
        expect(actor).toHaveProperty(methodName);
        expect(typeof (actor as any)[methodName]).toBe('function');
      });
    });

    it('should handle concurrent RPC calls safely', async () => {
      const alert: IncidentAlert = {
        source: 'test',
        alert_type: 'test',
        severity: 'P1',
        message: 'Concurrent test',
        affected_services: ['test-service'],
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      // Create multiple incidents concurrently
      const promises = Array(5).fill(null).map((_, i) =>
        actor.createIncident({
          ...alert,
          message: `Incident ${i}`,
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);

      // Verify all incidents were created with unique IDs
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });
});