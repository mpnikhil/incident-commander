/**
 * MODEL for rca-engine Service
 *
 * PRD REQUIREMENTS:
 * CONTROLLER (orchestration):
 * - performRCA(incidentData: IncidentInfo, context: string[]): Promise<RCAResult>
 * - generateAnalysisPrompt(incident: Incident, data: GatheredData): string
 * - parseRCAResult(llmResponse: string): StructuredRCA
 * - LLM INTEGRATION: Crafts analysis prompts, processes AI responses, structures results
 *
 * MUST IMPLEMENT:
 * 1. RCA data structure validation
 * 2. Analysis confidence scoring algorithms
 * 3. Evidence correlation logic
 * 4. Root cause hypothesis ranking
 * 5. Action recommendation risk assessment
 *
 * INTERFACES TO EXPORT:
 * - validateRCAData(data: GatheredData): ValidationResult
 * - calculateConfidenceScore(evidence: string[], hypothesis: string): number
 * - rankRootCauseHypotheses(hypotheses: string[]): string[]
 * - assessActionRisk(action: string, context: Incident): ActionRiskLevel
 * - structureRCAResult(analysis: any): RCAResult
 *
 * IMPORTS NEEDED:
 * - From shared types: RCAResult, GatheredData, Incident, ActionRiskLevel, ValidationError
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - Minimum confidence score of 0.7 required for autonomous actions
 * - At least 3 pieces of evidence required for high confidence
 * - Root cause must be supported by log/metric correlation
 * - Restart actions are low-risk, DB changes are high-risk
 *
 * ERROR HANDLING:
 * - ValidationError for insufficient evidence
 * - ProcessingError for analysis failures
 *
 * INTEGRATION POINTS:
 * - Used by rca-engine controller for analysis validation
 */

import {
  RCAResult,
  GatheredData,
  Incident,
  ActionRiskLevel,
  IncidentSeverity,
  RecommendedAction,
  ValidationError
} from '../types/shared';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates gathered data for RCA analysis
 * Business rule: Must have logs, metrics, and alerts for proper analysis
 */
export function validateRCAData(data: GatheredData): ValidationResult {
  const errors: string[] = [];

  // Check for minimum log data
  if (!data.logs || data.logs.length === 0) {
    errors.push('Insufficient log data - at least 1 log entry required');
  }

  // Check for metric data
  if (!data.metrics || data.metrics.length === 0) {
    errors.push('No metric data available for analysis');
  }

  // Check for alert data
  if (!data.alerts || data.alerts.length === 0) {
    errors.push('No alert data available for correlation');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculates confidence score based on evidence quality and relevance
 * Business rule: Score from 0-1, requires 3+ evidence for high confidence
 */
export function calculateConfidenceScore(evidence: string[], hypothesis: string): number {
  if (!evidence || evidence.length === 0) {
    return 0.0;
  }

  let baseScore = Math.min(evidence.length * 0.15, 0.7); // 0.15 per evidence item, max 0.7

  // Bonus for multiple pieces of evidence
  if (evidence.length >= 3) {
    baseScore += 0.1;
  }

  if (evidence.length >= 5) {
    baseScore += 0.1;
  }

  // Analyze relevance of evidence to hypothesis
  const hypothesisLower = hypothesis.toLowerCase();
  let relevanceScore = 0;

  evidence.forEach(item => {
    const itemLower = item.toLowerCase();

    // Check for direct keyword matches
    const hypothesisKeywords = hypothesisLower.split(' ').filter(word => word.length > 3);
    const matchingKeywords = hypothesisKeywords.filter(keyword =>
      itemLower.includes(keyword)
    );

    if (matchingKeywords.length > 0) {
      relevanceScore += 0.05 * matchingKeywords.length;
    }

    // Boost for technical specificity
    if (itemLower.includes('error') || itemLower.includes('exception') ||
        itemLower.includes('failed') || itemLower.includes('timeout')) {
      relevanceScore += 0.03;
    }
  });

  // Combine base score with relevance, cap at 1.0
  return Math.min(baseScore + relevanceScore, 1.0);
}

/**
 * Ranks root cause hypotheses by specificity and likelihood
 * Business rule: Technical/infrastructure causes ranked higher than generic ones
 */
export function rankRootCauseHypotheses(hypotheses: string[]): string[] {
  if (!hypotheses || hypotheses.length <= 1) {
    return [...hypotheses];
  }

  return [...hypotheses].sort((a, b) => {
    const scoreA = calculateHypothesisScore(a);
    const scoreB = calculateHypothesisScore(b);
    return scoreB - scoreA; // Higher scores first
  });
}

/**
 * Calculates hypothesis ranking score based on specificity and technical detail
 */
function calculateHypothesisScore(hypothesis: string): number {
  const lower = hypothesis.toLowerCase();
  let score = 0;

  // Penalize generic/vague terms
  const genericTerms = ['unknown', 'general', 'issue', 'problem', 'error'];
  genericTerms.forEach(term => {
    if (lower.includes(term)) {
      score -= 2;
    }
  });

  // Favor infrastructure issues
  const infraTerms = ['server', 'hardware', 'network', 'infrastructure', 'database', 'memory', 'cpu', 'disk'];
  infraTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 3;
    }
  });

  // Favor specific technical causes
  const techTerms = ['connection', 'timeout', 'crash', 'leak', 'exhausted', 'overflow', 'deadlock'];
  techTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 2;
    }
  });

  // Favor actionable causes
  const actionableTerms = ['restart', 'configuration', 'deployment', 'version'];
  actionableTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 1;
    }
  });

  return score;
}

/**
 * Assesses risk level for recommended actions
 * Business rule: DB/data changes require approval, restarts are autonomous
 */
export function assessActionRisk(action: string, context: Incident): ActionRiskLevel {
  const actionLower = action.toLowerCase();

  // High-risk actions that always require approval
  const highRiskTerms = [
    'database', 'db', 'schema', 'delete', 'drop', 'truncate', 'remove',
    'firewall', 'security', 'permission', 'access', 'credential',
    'network', 'routing', 'dns', 'certificate', 'ssl'
  ];

  if (highRiskTerms.some(term => actionLower.includes(term))) {
    return ActionRiskLevel.REQUIRES_APPROVAL;
  }

  // Critical incidents require approval for most changes
  if (context.severity === IncidentSeverity.P0) {
    const criticalApprovalActions = ['configuration', 'config', 'update', 'modify', 'change'];
    if (criticalApprovalActions.some(term => actionLower.includes(term))) {
      return ActionRiskLevel.REQUIRES_APPROVAL;
    }
  }

  // Safe autonomous actions
  const safeTerms = ['restart', 'reboot', 'scale_up', 'scale_down', 'clear_cache', 'flush'];
  if (safeTerms.some(term => actionLower.includes(term))) {
    return ActionRiskLevel.AUTONOMOUS_SAFE;
  }

  // Default for lower severity incidents with config changes
  if (context.severity === IncidentSeverity.P3 || context.severity === IncidentSeverity.P2) {
    if (actionLower.includes('configuration') || actionLower.includes('config')) {
      return ActionRiskLevel.AUTONOMOUS_SAFE;
    }
  }

  // Default to requiring approval for unknown actions
  return ActionRiskLevel.REQUIRES_APPROVAL;
}

/**
 * Structures analysis results into proper RCAResult format
 * Business rule: Validates confidence scores and evidence requirements
 */
export function structureRCAResult(incidentId: string, analysis: any): RCAResult {
  // Validate confidence score
  if (analysis.confidenceScore < 0 || analysis.confidenceScore > 1) {
    throw new ValidationError('Confidence score must be between 0 and 1');
  }

  // Validate evidence for high confidence claims
  if (analysis.confidenceScore >= 0.8 && (!analysis.evidence || analysis.evidence.length < 3)) {
    throw new ValidationError('High confidence scores require at least 3 pieces of evidence');
  }

  // Structure recommended actions
  const recommendedActions: RecommendedAction[] = (analysis.recommendedActions || []).map((action: any) => {
    // Use provided risk level or determine based on action type
    let riskLevel = action.risk_level;
    if (!riskLevel) {
      // Determine risk level based on action type for the incident context
      const mockIncident = {
        severity: 'P1', // Default severity for risk assessment
        affected_services: [],
        id: 'temp',
        title: '',
        description: '',
        status: 'investigating',
        source: '',
        created_at: '',
        updated_at: '',
        metadata: {}
      };
      riskLevel = assessActionRisk(action.type || 'unknown', mockIncident as any);
    }

    return {
      action_type: action.type || 'unknown',
      description: action.description || '',
      risk_level: riskLevel,
      target: action.target || '',
      params: action.params || {},
      estimated_impact: action.impact || ''
    };
  });

  return {
    incident_id: incidentId,
    root_cause: analysis.rootCause || 'Unknown',
    evidence: analysis.evidence || [],
    confidence_score: analysis.confidenceScore || 0,
    contributing_factors: analysis.contributingFactors || [],
    recommended_actions: recommendedActions,
    analysis_timeline: analysis.timeline || [],
    prevention_strategies: analysis.prevention || []
  };
}