// Case management types for DualPay

import type { AdjudicationRun, ClaimStatus } from './claim';

export interface Case {
  case_id: string;
  member_id: string;
  created_at: string;
  status: CaseStatus;
  claim_ids: string[];
  description: string;
  tags: string[];
}

export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'PENDING_RETRO' | 'RESOLVED' | 'CLOSED';

export interface CaseEvent {
  event_id: string;
  case_id: string;
  timestamp: string;
  event_type: CaseEventType;
  claim_id?: string;
  description: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export type CaseEventType =
  | 'CASE_CREATED'
  | 'CLAIM_LINKED'
  | 'CLAIM_REVERSED'
  | 'CLAIM_ADJUSTED'
  | 'RETRO_TRIGGERED'
  | 'RETRO_COMPLETED'
  | 'ACCUMULATOR_UPDATED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED';

/** Diff between two adjudication runs for the same claim */
export interface AdjudicationDiff {
  claim_id: string;
  before_run_id: string;
  after_run_id: string;
  line_diffs: LineDiff[];
  total_plan_paid_delta: number;
  total_member_resp_delta: number;
}

export interface LineDiff {
  line_id: string;
  field: string;
  before: number;
  after: number;
  delta: number;
}

/** Accumulator impact across a case */
export interface CaseAccumulatorImpact {
  case_id: string;
  member_id: string;
  claims: ClaimAccumulatorContribution[];
  total_deductible_applied: number;
  total_oop_applied: number;
  total_plan_paid: number;
}

export interface ClaimAccumulatorContribution {
  claim_id: string;
  status: ClaimStatus;
  deductible_applied: number;
  coinsurance_applied: number;
  copay_applied: number;
  plan_paid: number;
  member_responsibility: number;
}
