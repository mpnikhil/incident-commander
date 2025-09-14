import { describe, expect, test, vi, beforeEach, Mock } from 'vitest';
import {
  performRCA,
  generateAnalysisPrompt,
  parseRCAFromLLM,
  enrichWithHistoricalContext,
  saveAnalysisToMemory
} from './controller';
import {
  Incident,
  GatheredData,
  RCAResult,
  IncidentSeverity,
  IncidentStatus,
  ActionRiskLevel,
  ProcessingError
} from '../types/shared';

// Mock environment
const mockEnv = {
  AI: {
    run: vi.fn()
  },
  CONVERSATION_MEMORY: {
    search: vi.fn(),
    put: vi.fn()
  },
  KNOWLEDGE_BASE: {
    search: vi.fn()
  },
  METRICS_DATABASE: {
    execute: vi.fn()
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
};

describe('RCA Engine Controller', () => {
  const mockIncident: Incident = {
    id: 'inc-001',
    title: 'API Service Downtime',
    description: 'API service returning 500 errors',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.ANALYZING,
    source: 'monitoring',
    affected_services: ['api-service', 'payment-service'],
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:30:00Z',
    metadata: { region: 'us-west-2', customer_impact: 'high' }
  };

  const mockGatheredData: GatheredData = {
    logs: [
      {
        timestamp: '2025-01-15T10:00:00Z',
        service: 'api-service',
        level: 'ERROR',
        message: 'OutOfMemoryError: Java heap space',
        metadata: { thread: 'http-nio-8080-exec-1' }
      },
      {
        timestamp: '2025-01-15T10:01:00Z',
        service: 'api-service',
        level: 'ERROR',
        message: 'Failed to process request due to memory exhaustion'
      }
    ],
    metrics: [
      {
        metric_name: 'jvm.memory.used',
        timestamp: '2025-01-15T10:00:00Z',
        value: 2048000000, // 2GB
        labels: { service: 'api-service', type: 'heap' }
      },
      {
        metric_name: 'http.requests.errors',
        timestamp: '2025-01-15T10:00:00Z',
        value: 150,
        labels: { service: 'api-service', status: '500' }
      }
    ],
    alerts: [
      {
        id: 'alert-mem-001',
        severity: 'critical',
        trigger_condition: 'jvm_memory_usage > 95%',
        timestamp: '2025-01-15T09:58:00Z',
        service: 'api-service',
        status: 'firing'
      }
    ],
    system_status: [
      {
        service: 'api-service',
        status: 'degraded',
        dependencies: ['database', 'cache'],
        health_checks: { memory: false, connectivity: true }
      }
    ],
    runbooks: [
      {
        id: 'rb-memory',
        title: 'Memory Issues Troubleshooting',
        content: 'Steps to diagnose and resolve memory issues',
        incident_types: ['memory', 'performance'],
        procedures: ['check_heap_dump', 'restart_service'],
        relevance_score: 0.92
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('performRCA', () => {
    test('should successfully perform RCA analysis with valid data', async () => {
      // Mock AI response
      const mockAIResponse = `ROOT_CAUSE: Java application memory exhaustion due to heap overflow

EVIDENCE:
- OutOfMemoryError in application logs
- JVM heap memory usage at 100% capacity
- Critical memory alert triggered
- HTTP 500 errors correlating with memory alerts

CONFIDENCE: 0.85

CONTRIBUTING_FACTORS:
- Memory leak in request processing
- Inadequate heap size configuration
- High traffic load during incident

RECOMMENDED_ACTIONS:
- restart_service: Restart API service to reclaim memory (autonomous_safe)
- increase_heap_size: Update JVM heap configuration (requires_approval)
- investigate_memory_leak: Analyze heap dump for memory leaks (autonomous_safe)

TIMELINE:
- 09:58:00 Memory usage exceeded threshold
- 10:00:00 OutOfMemoryError occurred
- 10:01:00 Service degraded, 500 errors increased

PREVENTION:
- Implement memory usage monitoring and alerting
- Set up automatic heap dump collection
- Review and optimize memory allocation patterns`;

      (mockEnv.AI.run as Mock).mockResolvedValueOnce(mockAIResponse);
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({
        results: [
          {
            content: 'Previous memory issue in api-service resolved by increasing heap size',
            score: 0.8,
            metadata: { incident_id: 'inc-previous' }
          }
        ]
      });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.CONVERSATION_MEMORY.put as Mock).mockResolvedValueOnce({});

      const result = await performRCA(mockIncident, mockGatheredData, mockEnv);

      expect(result.incident_id).toBe('inc-001');
      expect(result.root_cause).toBe('Java application memory exhaustion due to heap overflow');
      expect(result.confidence_score).toBe(0.85);
      expect(result.evidence).toHaveLength(4);
      expect(result.recommended_actions).toHaveLength(3);
      expect(result.recommended_actions[0].risk_level).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
      expect(result.recommended_actions[1].risk_level).toBe(ActionRiskLevel.REQUIRES_APPROVAL);

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        'deepseek-v3',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: expect.stringContaining('INCIDENT ANALYSIS REQUEST') })
          ])
        })
      );
    });

    test('should fallback to simpler model on primary AI failure', async () => {
      const simpleResponse = 'ROOT_CAUSE: Memory issue\nEVIDENCE:\n- Memory errors\nCONFIDENCE: 0.6';

      (mockEnv.AI.run as Mock)
        .mockRejectedValueOnce(new Error('deepseek-v3 unavailable'))
        .mockResolvedValueOnce(simpleResponse);
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.CONVERSATION_MEMORY.put as Mock).mockResolvedValueOnce({});

      const result = await performRCA(mockIncident, mockGatheredData, mockEnv);

      expect(result.root_cause).toBe('Memory issue');
      expect(result.confidence_score).toBe(0.6);
      expect(mockEnv.AI.run).toHaveBeenCalledWith('deepseek-v3', expect.any(Object));
      expect(mockEnv.AI.run).toHaveBeenCalledWith('llama-3.1-8b-instruct', expect.any(Object));
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Primary AI model failed: deepseek-v3 unavailable, falling back to simpler model')
      );
    });

    test('should throw ProcessingError when all AI models fail', async () => {
      (mockEnv.AI.run as Mock).mockRejectedValue(new Error('AI service unavailable'));
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });

      await expect(performRCA(mockIncident, mockGatheredData, mockEnv))
        .rejects.toThrow(ProcessingError);

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('All AI models failed during RCA analysis: Primary:')
      );
    });

    test('should validate AI response before returning results', async () => {
      const invalidResponse = 'Invalid response format';
      (mockEnv.AI.run as Mock).mockResolvedValueOnce(invalidResponse);
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });

      await expect(performRCA(mockIncident, mockGatheredData, mockEnv))
        .rejects.toThrow('Failed to parse LLM response');
    });

    test('should include historical context in analysis', async () => {
      const mockHistoricalContext = [
        'Similar memory issue in api-service 2 weeks ago',
        'Previous resolution: increased heap size from 1GB to 2GB'
      ];

      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({
        results: mockHistoricalContext.map(content => ({ content, score: 0.8, metadata: {} }))
      });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.CONVERSATION_MEMORY.put as Mock).mockResolvedValueOnce({});

      const validResponse = 'ROOT_CAUSE: Memory issue\nEVIDENCE:\n- Memory errors\nCONFIDENCE: 0.7';
      (mockEnv.AI.run as Mock).mockResolvedValueOnce(validResponse);

      await performRCA(mockIncident, mockGatheredData, mockEnv);

      const analysisPrompt = (mockEnv.AI.run as Mock).mock.calls[0][1];
      const userMessage = analysisPrompt.messages.find((msg: any) => msg.role === 'user')?.content || '';
      expect(userMessage).toContain('HISTORICAL CONTEXT');
      expect(userMessage).toContain(mockHistoricalContext[0]);
      expect(userMessage).toContain(mockHistoricalContext[1]);
    });
  });

  describe('generateAnalysisPrompt', () => {
    test('should create comprehensive analysis prompt for P0 incident', () => {
      const criticalIncident = { ...mockIncident, severity: IncidentSeverity.P0 };
      const prompt = generateAnalysisPrompt(criticalIncident, mockGatheredData);

      expect(prompt).toContain('CRITICAL INCIDENT ANALYSIS');
      expect(prompt).toContain('SEVERITY: P0');
      expect(prompt).toContain('AFFECTED SERVICES: api-service, payment-service');
      expect(prompt).toContain('OutOfMemoryError');
      expect(prompt).toContain('jvm.memory.used');
      expect(prompt).toContain('Memory Issues Troubleshooting');
      expect(prompt).toContain('ROOT_CAUSE:');
      expect(prompt).toContain('EVIDENCE:');
      expect(prompt).toContain('CONFIDENCE:');
      expect(prompt).toContain('RECOMMENDED_ACTIONS:');
    });

    test('should include relevant runbook information in prompt', () => {
      const prompt = generateAnalysisPrompt(mockIncident, mockGatheredData);

      expect(prompt).toContain('RELEVANT RUNBOOKS:');
      expect(prompt).toContain('Memory Issues Troubleshooting');
      expect(prompt).toContain('check_heap_dump');
      expect(prompt).toContain('restart_service');
      expect(prompt).toContain('Relevance: 92%');
    });

    test('should adapt prompt based on incident type', () => {
      const networkIncident = {
        ...mockIncident,
        title: 'Network Connectivity Issues',
        description: 'Services unable to communicate'
      };

      const networkData = {
        ...mockGatheredData,
        logs: [
          {
            timestamp: '2025-01-15T10:00:00Z',
            service: 'api-service',
            level: 'ERROR',
            message: 'Connection refused to downstream service'
          }
        ]
      };

      const prompt = generateAnalysisPrompt(networkIncident, networkData);

      expect(prompt).toContain('Network Connectivity Issues');
      expect(prompt).toContain('Connection refused');
      expect(prompt).toContain('Focus on network connectivity, firewall rules, and service discovery');
    });

    test('should handle missing data gracefully', () => {
      const minimalData: GatheredData = {
        logs: [],
        metrics: [],
        alerts: [],
        system_status: [],
        runbooks: []
      };

      const prompt = generateAnalysisPrompt(mockIncident, minimalData);

      expect(prompt).toContain('LIMITED DATA AVAILABLE');
      expect(prompt).toContain('No log data available');
      expect(prompt).toContain('No metric data available');
      expect(() => generateAnalysisPrompt(mockIncident, minimalData)).not.toThrow();
    });
  });

  describe('parseRCAFromLLM', () => {
    test('should parse complete LLM response correctly', () => {
      const llmResponse = `ROOT_CAUSE: Database connection pool exhaustion

EVIDENCE:
- Connection timeout errors in logs
- Connection pool metrics at 0
- Multiple services affected
- Health checks failing

CONFIDENCE: 0.85

CONTRIBUTING_FACTORS:
- High traffic load
- Inadequate pool sizing

RECOMMENDED_ACTIONS:
- restart_service: Restart connection pool (autonomous_safe)
- increase_pool_size: Update configuration (requires_approval)

TIMELINE:
- 10:00 Connection errors started
- 10:01 Pool exhausted

PREVENTION:
- Monitor connection usage
- Implement auto-scaling`;

      const result = parseRCAFromLLM(llmResponse);

      expect(result.root_cause).toBe('Database connection pool exhaustion');
      expect(result.evidence).toHaveLength(4);
      expect(result.confidence_score).toBe(0.85);
      expect(result.contributing_factors).toHaveLength(2);
      expect(result.recommended_actions).toHaveLength(2);
      expect(result.recommended_actions[0].risk_level).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
      expect(result.analysis_timeline).toHaveLength(2);
      expect(result.prevention_strategies).toHaveLength(2);
    });

    test('should handle malformed LLM response with missing sections', () => {
      const malformedResponse = `ROOT_CAUSE: Some issue

CONFIDENCE: 0.5`;

      const result = parseRCAFromLLM(malformedResponse);

      expect(result.root_cause).toBe('Some issue');
      expect(result.confidence_score).toBe(0.5);
      expect(result.evidence).toEqual([]);
      expect(result.recommended_actions).toEqual([]);
    });

    test('should throw error for completely invalid response', () => {
      const invalidResponse = 'This is not a valid RCA response format';

      expect(() => parseRCAFromLLM(invalidResponse))
        .toThrow('Failed to parse LLM response: missing required ROOT_CAUSE section');
    });

    test('should parse action risk levels correctly', () => {
      const responseWithActions = `ROOT_CAUSE: Test issue

CONFIDENCE: 0.7

RECOMMENDED_ACTIONS:
- restart_service: Safe restart (autonomous_safe)
- modify_database: Change schema (requires_approval)
- update_config: Safe config update (autonomous_safe)`;

      const result = parseRCAFromLLM(responseWithActions);

      expect(result.recommended_actions).toHaveLength(3);
      expect(result.recommended_actions[0].risk_level).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
      expect(result.recommended_actions[1].risk_level).toBe(ActionRiskLevel.REQUIRES_APPROVAL);
      expect(result.recommended_actions[2].risk_level).toBe(ActionRiskLevel.AUTONOMOUS_SAFE);
    });

    test('should validate confidence score bounds', () => {
      const invalidConfidence = `
      ROOT_CAUSE: Test
      CONFIDENCE: 1.5
      `;

      expect(() => parseRCAFromLLM(invalidConfidence))
        .toThrow('Invalid confidence score: must be between 0 and 1');
    });
  });

  describe('enrichWithHistoricalContext', () => {
    test('should retrieve relevant historical incidents', async () => {
      const mockHistoricalData = [
        {
          content: 'Previous memory leak in api-service resolved by code fix',
          metadata: { incident_id: 'inc-100', timestamp: '2025-01-10', similarity: 0.85 }
        },
        {
          content: 'Similar heap exhaustion issue in payment-service',
          metadata: { incident_id: 'inc-105', timestamp: '2025-01-12', similarity: 0.78 }
        }
      ];

      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({
        results: mockHistoricalData.map(item => ({
          content: item.content,
          score: item.metadata.similarity || 0.8,
          metadata: item.metadata
        }))
      });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({
        results: [
          {
            content: 'Memory issues troubleshooting guide',
            score: 0.9,
            metadata: { relevance: 0.9 }
          }
        ]
      });

      const context = await enrichWithHistoricalContext(mockIncident, mockEnv);

      expect(context).toHaveLength(3);
      expect(context[0]).toContain('Similar incident (score: 0.85): Previous memory leak in api-service resolved by code fix');
      expect(context[1]).toContain('Similar incident (score: 0.78): Similar heap exhaustion issue in payment-service');
      expect(context[2]).toContain('Knowledge base entry (score: 0.90): Memory issues troubleshooting guide');

      expect(mockEnv.CONVERSATION_MEMORY.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(String),
          limit: 3,
          threshold: 0.7
        })
      );
    });

    test('should handle empty historical context gracefully', async () => {
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockResolvedValueOnce({ results: [] });
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });

      const context = await enrichWithHistoricalContext(mockIncident, mockEnv);

      expect(context).toEqual(['No similar historical incidents found in system memory']);
    });

    test('should handle search failures gracefully', async () => {
      (mockEnv.CONVERSATION_MEMORY.search as Mock).mockRejectedValueOnce(
        new Error('Memory search failed')
      );
      (mockEnv.KNOWLEDGE_BASE.search as Mock).mockResolvedValueOnce({ results: [] });

      const context = await enrichWithHistoricalContext(mockIncident, mockEnv);

      expect(context).toEqual(['No similar historical incidents found in system memory']);
      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        'Failed to search memory: Memory search failed'
      );
    });
  });

  describe('saveAnalysisToMemory', () => {
    test('should save RCA results to conversation memory', async () => {
      const mockRCAResult: RCAResult = {
        incident_id: 'inc-001',
        root_cause: 'Memory exhaustion',
        evidence: ['Memory errors', 'High usage'],
        confidence_score: 0.85,
        contributing_factors: ['Traffic spike'],
        recommended_actions: [],
        analysis_timeline: [],
        prevention_strategies: []
      };

      (mockEnv.CONVERSATION_MEMORY.put as Mock).mockResolvedValueOnce({});

      await saveAnalysisToMemory(mockIncident, mockRCAResult, mockEnv);

      expect(mockEnv.CONVERSATION_MEMORY.put).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: expect.any(String),
          content: expect.stringContaining('Memory exhaustion'),
          key: 'rca_analysis',
          timeline: 'incident_inc-001'
        })
      );
    });

    test('should handle memory save failures gracefully', async () => {
      const mockRCAResult: RCAResult = {
        incident_id: 'inc-001',
        root_cause: 'Test issue',
        evidence: [],
        confidence_score: 0.5,
        contributing_factors: [],
        recommended_actions: [],
        analysis_timeline: [],
        prevention_strategies: []
      };

      (mockEnv.CONVERSATION_MEMORY.put as Mock).mockRejectedValueOnce(
        new Error('Memory storage failed')
      );

      await expect(saveAnalysisToMemory(mockIncident, mockRCAResult, mockEnv))
        .resolves.not.toThrow();

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        'Failed to save to SmartMemory: Memory storage failed'
      );
    });
  });
});