/** Phase 17 — Background processing domain types. */

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter';

export type QueueJobType =
  | 'remittance_analysis'
  | 'contract_matching'
  | 'underpayment_detection'
  | 'dispute_generation'
  | 'recovery_case_generation'
  | 'queue_assignment'
  | 'executive_recalculation';

export interface QueueJob {
  queue_job_id: string;
  org_id: string;
  pipeline_id: string | null;
  job_type: QueueJobType;
  status: QueueJobStatus;
  priority: number;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
  locked_at: string | null;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface JobRun {
  run_id: string;
  org_id: string;
  queue_job_id: string;
  worker_id: string;
  duration_ms: number;
  status: 'completed' | 'failed';
  result_summary: Record<string, unknown> | null;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  created_at: string;
}

export interface JobFailure {
  failure_id: string;
  org_id: string;
  queue_job_id: string;
  error_message: string;
  stack_trace: string | null;
  retry_count: number;
  archived: boolean;
  created_at: string;
}
