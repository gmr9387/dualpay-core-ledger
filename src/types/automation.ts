/**
 * Phase 16 — Automation domain types.
 * Mirror of automation_jobs / automation_rules rows.
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JobType =
  | 'remittance_analysis'
  | 'contract_matching'
  | 'underpayment_detection'
  | 'dispute_generation'
  | 'recovery_case_generation'
  | 'queue_assignment'
  | 'executive_recalculation'
  | 'pipeline';

export interface AutomationJob {
  job_id: string;
  org_id: string;
  job_type: JobType;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  error_summary: string | null;
  recovery_value_cents: number;
  pipeline_id: string | null;
  parent_job_id: string | null;
  config: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RuleTriggerType =
  | 'underpayment_threshold'
  | 'sla_risk'
  | 'evidence_stale'
  | 'denial_severity'
  | 'repeat_payer_issue';

export interface AutomationRule {
  rule_id: string;
  org_id: string;
  rule_name: string;
  description: string | null;
  trigger_type: RuleTriggerType;
  enabled: boolean;
  configuration: Record<string, unknown>;
  last_triggered_at: string | null;
  trigger_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRunResult {
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  recovery_value_cents?: number;
  notes?: string[];
  details?: Record<string, unknown>;
}
