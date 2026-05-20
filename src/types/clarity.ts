/**
 * Claim Clarity — Operational Intelligence types
 *
 * Layered on top of the DualPay adjudication primitives. These types
 * describe the operational reimbursement view: denials, payer responses,
 * timeline events, appeals, and prioritized work-queue items.
 */

export type DenialCategory =
  | 'authorization'
  | 'eligibility'
  | 'cob'
  | 'modifier'
  | 'duplicate'
  | 'medical_necessity'
  | 'missing_documentation'
  | 'timely_filing'
  | 'contractual'
  | 'bundled'
  | 'coding'
  | 'coverage'
  | 'underpayment';

export type DenialSeverity = 'critical' | 'high' | 'medium' | 'low';

export type WorkflowOwner =
  | 'biller'
  | 'coder'
  | 'auth_team'
  | 'clinical'
  | 'appeals'
  | 'cob_team'
  | 'eligibility'
  | 'unassigned';

export type AgingBucket = '0-30' | '31-60' | '61-90' | '91-120' | '120+';

export type ReimbursementState =
  | 'submitted'
  | 'pending_payer'
  | 'partially_paid'
  | 'denied'
  | 'paid'
  | 'appealing'
  | 'resolved'
  | 'written_off';

export type GroupCode = 'CO' | 'PR' | 'OA' | 'PI' | 'CR';

export interface DenialEvent {
  denial_id: string;
  claim_id: string;
  line_id?: string;
  occurred_at: string;
  carc_code: string;
  rarc_code?: string;
  group_code: GroupCode;
  amount_cents: number;
  category: DenialCategory;
  severity: DenialSeverity;
  recoverability_score: number; // 0-100
  root_cause: string;
  recommended_action: string;
  workflow_owner: WorkflowOwner;
  appeal_eligible: boolean;
  evidence_required: string[];
  payer_message?: string;
}

export interface PayerResponse {
  response_id: string;
  claim_id: string;
  payer_id: string;
  payer_name: string;
  received_at: string;
  response_type:
    | 'EOB_835'
    | 'DENIAL'
    | 'REQUEST_INFO'
    | 'PARTIAL_PAY'
    | 'ADJUSTMENT'
    | 'ACK';
  billed_cents: number;
  allowed_cents: number;
  paid_cents: number;
  patient_resp_cents: number;
  adjustment_cents: number;
  source: 'edi_835' | 'portal' | 'fax' | 'manual';
  trace_ref?: string;
}

export type TimelineKind =
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'DENIED'
  | 'PARTIAL_PAY'
  | 'PAID'
  | 'APPEAL_FILED'
  | 'APPEAL_DECISION'
  | 'INFO_REQUESTED'
  | 'INFO_PROVIDED'
  | 'RESUBMITTED'
  | 'NOTE_ADDED'
  | 'STATUS_CHANGED'
  | 'ESCALATED';

export interface ReimbursementTimelineEvent {
  event_id: string;
  claim_id: string;
  occurred_at: string;
  kind: TimelineKind;
  actor: string;
  description: string;
  amount_cents?: number;
}

export type AppealStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'denied'
  | 'partial';

export interface Appeal {
  appeal_id: string;
  claim_id: string;
  denial_id?: string;
  status: AppealStatus;
  level: 1 | 2 | 3;
  filed_at?: string;
  decision_at?: string;
  amount_in_dispute_cents: number;
  amount_recovered_cents?: number;
  evidence_attached: string[];
  rationale: string;
  appeal_readiness_score: number; // 0-100
}

export type WorkQueueId =
  | 'unresolved_denials'
  | 'high_value'
  | 'appeals_in_progress'
  | 'missing_docs'
  | 'stalled'
  | 'escalation'
  | 'aging'
  | 'payer_follow_up';

export interface WorkQueueAssignment {
  queue: WorkQueueId;
  assigned_to?: string;
  sla_due_at: string;
  last_action_at: string;
  notes: string;
}

/**
 * The Claim Intelligence envelope.  Persisted inside the existing
 * `claims.payload` JSON column so we get persistence without new
 * tables.  Optional on the Claim type — claims without an intel
 * record are treated as freshly received.
 */
export interface ClaimIntel {
  payer_id: string;
  payer_name: string;
  payer_class: 'commercial' | 'medicare' | 'medicaid' | 'workers_comp' | 'self_pay';
  submitted_at: string;
  aging_days: number;
  aging_bucket: AgingBucket;
  reimbursement_state: ReimbursementState;
  expected_reimbursement_cents: number;
  actual_reimbursement_cents: number;
  underpayment_cents: number;
  amount_at_risk_cents: number;
  recoverability_score: number; // 0-100
  severity: DenialSeverity;
  workflow_owner: WorkflowOwner;
  sla_due_at: string;
  is_escalated: boolean;
  is_high_value: boolean;
  is_stalled: boolean;
  denial_events: DenialEvent[];
  payer_responses: PayerResponse[];
  timeline: ReimbursementTimelineEvent[];
  appeals: Appeal[];
  evidence_missing: string[];
  notes: string[];
  queues: WorkQueueId[];
}

export interface PayerProfile {
  payer_id: string;
  payer_name: string;
  payer_class: ClaimIntel['payer_class'];
  avg_days_to_pay: number;
  denial_rate: number; // 0-1
  appeal_overturn_rate: number; // 0-1
  total_claims: number;
  total_paid_cents: number;
  total_outstanding_cents: number;
}
