/**
 * Shared Types and Interfaces for Nightrider SRE Agent
 *
 * Critical interfaces used across all MVC components
 * Domain entities, request/response types, and event payloads
 */

// Core Domain Entities

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: string;
  affected_services: string[];
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  event: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export enum IncidentSeverity {
  P0 = "P0", // Critical - service down
  P1 = "P1", // High - major functionality impacted
  P2 = "P2", // Medium - minor functionality impacted
  P3 = "P3"  // Low - minimal impact
}

export enum IncidentStatus {
  RECEIVED = "received",
  INVESTIGATING = "investigating",
  ANALYZING = "analyzing",
  REMEDIATING = "remediating",
  RESOLVED = "resolved",
  ESCALATED = "escalated"
}

export interface RCAResult {
  incident_id: string;
  root_cause: string;
  evidence: string[];
  confidence_score: number;
  contributing_factors: string[];
  recommended_actions: RecommendedAction[];
  analysis_timeline: string[];
  prevention_strategies: string[];
}

export interface RecommendedAction {
  action_type: string;
  description: string;
  risk_level: ActionRiskLevel;
  target: string;
  params?: Record<string, any>;
  estimated_impact: string;
}

export enum ActionRiskLevel {
  AUTONOMOUS_SAFE = "autonomous_safe",
  REQUIRES_APPROVAL = "requires_approval"
}

// Request/Response Types

export interface IncidentAlert {
  source: string;
  alert_type: string;
  severity: string;
  message: string;
  affected_services: string[];
  timestamp: string;
  metadata: Record<string, any>;
}

export interface IncidentResponse {
  incident_id: string;
  agent_status: string;
  initial_assessment: string;
  estimated_analysis_time: string;
}

export interface ProcessingResult {
  status: string;
  agent_analysis: RCAResult;
  actions_taken: string[];
  timeline: string[];
}

// MCP Tool Types

export interface LogEntry {
  timestamp: string;
  service: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface MetricData {
  metric_name: string;
  timestamp: string;
  value: number;
  labels?: Record<string, string>;
}

export interface AlertData {
  id: string;
  severity: string;
  trigger_condition: string;
  timestamp: string;
  service: string;
  status: string;
}

export interface SystemStatus {
  service: string;
  status: "healthy" | "degraded" | "down";
  dependencies: string[];
  health_checks: Record<string, boolean>;
}

export interface RunbookEntry {
  id: string;
  title: string;
  content: string;
  incident_types: string[];
  procedures: string[];
  relevance_score?: number;
}

// Event Payloads

export interface IncidentCreatedEvent {
  type: "incident_created";
  incident: Incident;
  timestamp: string;
}

export interface AnalysisCompletedEvent {
  type: "analysis_completed";
  incident_id: string;
  rca_result: RCAResult;
  timestamp: string;
}

export interface RemediationExecutedEvent {
  type: "remediation_executed";
  incident_id: string;
  action: RecommendedAction;
  result: string;
  timestamp: string;
}

export interface NotificationEvent {
  type: "notification";
  recipient: string;
  subject: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  incident_id?: string;
}

// Data Gathering Types

export interface GatherDataStrategy {
  incident_type: string;
  required_logs: string[];
  required_metrics: string[];
  time_range: string;
  search_terms?: string[];
}

export interface GatheredData {
  logs: LogEntry[];
  metrics: MetricData[];
  alerts: AlertData[];
  system_status: SystemStatus[];
  runbooks: RunbookEntry[];
}

// Agent Memory Types

export interface AnalysisContext {
  incident_id: string;
  session_id: string;
  timeline: string;
  agent: string;
  content: string;
  metadata: Record<string, any>;
}

// Error Types

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ProcessingError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = "ProcessingError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// Configuration Types

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface ExternalAPIConfig {
  api_key: string;
  base_url?: string;
  timeout?: number;
}

// Remediation Types

export interface RemediationResult {
  success: boolean;
  executed_actions: string[];
  failed_actions: string[];
  pending_approval: string[];
  total_actions: number;
  execution_time_ms: number;
  errors?: string[];
}

export interface ExecutionResult {
  action_type: string;
  success: boolean;
  message: string;
  execution_time_ms: number;
  rollback_plan?: RollbackPlan;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RiskAssessment {
  risk_level: ActionRiskLevel;
  risk_factors: string[];
  mitigation_steps: string[];
  requires_approval: boolean;
}

export interface RollbackPlan {
  rollback_actions: RecommendedAction[];
  rollback_conditions: string[];
  rollback_timeout: number;
}

export interface RollbackResult {
  rollback_successful: boolean;
  rollback_actions: string[];
  rollback_time_ms: number;
  errors?: string[];
}

export interface ExecutionReport {
  action: RecommendedAction;
  result: ExecutionResult;
  timestamp: string;
  execution_id: string;
}

export interface ApprovalResult {
  approval_requested: boolean;
  actions_pending_approval: string[];
  approval_id: string;
  estimated_approval_time: string;
}

export interface ActionStatus {
  execution_id: string;
  status: 'completed' | 'in_progress' | 'failed';
  progress: number;
  message?: string;
  completion_time?: string;
}