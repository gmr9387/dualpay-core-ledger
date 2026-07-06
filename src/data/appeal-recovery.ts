import { supabase } from '@/integrations/supabase/client';

export const APPEAL_RECOVERY_STATES = [
  'denied',
  'packet_ready',
  'review_requested',
  'core_decision_received',
  'approval_required',
  'approval_workflow_launched',
  'approved_for_submission',
  'submitted_manual_delivery',
  'payer_response_received',
  'recovered',
  'lost',
  'written_off',
] as const;

export type AppealRecoveryState = (typeof APPEAL_RECOVERY_STATES)[number];

export const APPEAL_RECOVERY_TRANSITIONS: Record<AppealRecoveryState, AppealRecoveryState[]> = {
  denied: ['packet_ready', 'lost', 'written_off'],
  packet_ready: ['review_requested', 'lost', 'written_off'],
  review_requested: ['core_decision_received', 'lost', 'written_off'],
  core_decision_received: ['approval_required', 'approved_for_submission', 'lost', 'written_off'],
  approval_required: ['approval_workflow_launched', 'approved_for_submission', 'lost', 'written_off'],
  approval_workflow_launched: ['approved_for_submission', 'lost', 'written_off'],
  approved_for_submission: ['submitted_manual_delivery', 'lost', 'written_off'],
  submitted_manual_delivery: ['payer_response_received', 'recovered', 'lost', 'written_off'],
  payer_response_received: ['recovered', 'lost', 'written_off'],
  recovered: [],
  lost: [],
  written_off: [],
};

export interface AppealRecoveryCase {
  id: string;
  organization_id: string;
  claim_id: string;
  current_state: AppealRecoveryState;
  assigned_to_user_id: string | null;
  packet_id: string | null;
  core_trace_id: string | null;
  core_decision_outcome: string | null;
  core_dispatch_status: string | null;
  glue_run_id: string | null;
  payer_response_status: string | null;
  recovered_amount_cents: number | null;
  created_at: string;
  updated_at: string;
}

interface CasePatch {
  assigned_to_user_id?: string | null;
  packet_id?: string | null;
  core_trace_id?: string | null;
  core_decision_outcome?: string | null;
  core_dispatch_status?: string | null;
  glue_run_id?: string | null;
  payer_response_status?: string | null;
  recovered_amount_cents?: number | null;
}

function appealCasesTable() {
  return (supabase as any).from('appeal_recovery_cases');
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function canTransitionAppealRecovery(
  from: AppealRecoveryState,
  to: AppealRecoveryState,
): boolean {
  return APPEAL_RECOVERY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedAppealRecoveryTransitions(
  state: AppealRecoveryState,
): AppealRecoveryState[] {
  return APPEAL_RECOVERY_TRANSITIONS[state] ?? [];
}

export function isTerminalAppealRecoveryState(state: AppealRecoveryState): boolean {
  return state === 'recovered' || state === 'lost' || state === 'written_off';
}

export function getRecoveryStepLabel(state: AppealRecoveryState): string {
  switch (state) {
    case 'denied':
      return 'Import/View Denied Claim';
    case 'packet_ready':
      return 'Generate Appeal Packet';
    case 'review_requested':
      return 'Request Review';
    case 'core_decision_received':
      return 'Receive Core Decision';
    case 'approval_required':
      return 'Approval Required';
    case 'approval_workflow_launched':
      return 'Glue Approval Workflow Running';
    case 'approved_for_submission':
      return 'Approved for Submission';
    case 'submitted_manual_delivery':
      return 'Submitted Manually';
    case 'payer_response_received':
      return 'Payer Response Recorded';
    case 'recovered':
      return 'Recovered';
    case 'lost':
      return 'Lost';
    case 'written_off':
      return 'Written Off';
    default:
      return state;
  }
}

export async function getAppealRecoveryCase(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase | null> {
  const { data, error } = await appealCasesTable()
    .select('*')
    .eq('organization_id', organizationId)
    .eq('claim_id', claimId)
    .maybeSingle();

  if (error) throw error;
  return (data as AppealRecoveryCase | null) ?? null;
}

export async function getOrCreateAppealRecoveryCase(
  organizationId: string,
  claimId: string,
  assignedToUserId?: string,
): Promise<AppealRecoveryCase> {
  const existing = await getAppealRecoveryCase(organizationId, claimId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const row = {
    id: createId('arc'),
    organization_id: organizationId,
    claim_id: claimId,
    current_state: 'denied' as AppealRecoveryState,
    assigned_to_user_id: assignedToUserId ?? null,
    packet_id: null,
    core_trace_id: null,
    core_decision_outcome: null,
    core_dispatch_status: null,
    glue_run_id: null,
    payer_response_status: null,
    recovered_amount_cents: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await appealCasesTable()
    .upsert([row], { onConflict: 'organization_id,claim_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data as AppealRecoveryCase;
}

export async function transitionAppealRecoveryCase(
  organizationId: string,
  claimId: string,
  toState: AppealRecoveryState,
  patch: CasePatch = {},
): Promise<AppealRecoveryCase> {
  const current = await getOrCreateAppealRecoveryCase(organizationId, claimId);

  if (current.current_state !== toState && !canTransitionAppealRecovery(current.current_state, toState)) {
    throw new Error(`Invalid appeal recovery transition: ${current.current_state} -> ${toState}`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    ...patch,
    organization_id: organizationId,
    claim_id: claimId,
    current_state: toState,
    updated_at: now,
  };

  const { data, error } = await appealCasesTable()
    .upsert([updated], { onConflict: 'organization_id,claim_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data as AppealRecoveryCase;
}

export async function generatePacketForRecovery(
  organizationId: string,
  claimId: string,
  packetId?: string,
): Promise<AppealRecoveryCase> {
  const current = await getOrCreateAppealRecoveryCase(organizationId, claimId);
  if (current.current_state === 'packet_ready' && current.packet_id) return current;

  return transitionAppealRecoveryCase(organizationId, claimId, 'packet_ready', {
    packet_id: packetId ?? current.packet_id ?? createId('pkt'),
  });
}

export async function requestReviewForRecovery(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase> {
  const current = await getOrCreateAppealRecoveryCase(organizationId, claimId);
  if (current.current_state === 'review_requested') return current;

  return transitionAppealRecoveryCase(organizationId, claimId, 'review_requested');
}

export async function runCoreDecisionForRecovery(
  organizationId: string,
  claimId: string,
  params: {
    coreTraceId: string;
    outcome: 'approval_required' | 'approved_for_submission' | 'lost' | 'written_off';
    dispatchStatus: string;
  },
): Promise<AppealRecoveryCase> {
  const afterDecision = await transitionAppealRecoveryCase(
    organizationId,
    claimId,
    'core_decision_received',
    {
      core_trace_id: params.coreTraceId,
      core_decision_outcome: params.outcome,
      core_dispatch_status: params.dispatchStatus,
    },
  );

  if (params.outcome === 'approval_required') {
    return transitionAppealRecoveryCase(organizationId, claimId, 'approval_required', {
      core_trace_id: params.coreTraceId,
      core_decision_outcome: params.outcome,
      core_dispatch_status: params.dispatchStatus,
    });
  }

  if (params.outcome === 'approved_for_submission') {
    return transitionAppealRecoveryCase(organizationId, claimId, 'approved_for_submission', {
      core_trace_id: params.coreTraceId,
      core_decision_outcome: params.outcome,
      core_dispatch_status: params.dispatchStatus,
    });
  }

  if (params.outcome === 'lost') {
    return transitionAppealRecoveryCase(organizationId, claimId, 'lost', {
      core_trace_id: params.coreTraceId,
      core_decision_outcome: params.outcome,
      core_dispatch_status: params.dispatchStatus,
    });
  }

  if (params.outcome === 'written_off') {
    return transitionAppealRecoveryCase(organizationId, claimId, 'written_off', {
      core_trace_id: params.coreTraceId,
      core_decision_outcome: params.outcome,
      core_dispatch_status: params.dispatchStatus,
    });
  }

  return afterDecision;
}

export async function launchApprovalWorkflowForRecovery(
  organizationId: string,
  claimId: string,
  glueRunId: string,
): Promise<AppealRecoveryCase> {
  const current = await getOrCreateAppealRecoveryCase(organizationId, claimId);
  if (current.current_state === 'approval_workflow_launched' && current.glue_run_id === glueRunId) return current;

  return transitionAppealRecoveryCase(organizationId, claimId, 'approval_workflow_launched', {
    glue_run_id: glueRunId,
  });
}

export async function markApprovedForSubmission(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'approved_for_submission');
}

export async function markSubmittedManually(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'submitted_manual_delivery');
}

export async function recordPayerResponseForRecovery(
  organizationId: string,
  claimId: string,
  payerResponseStatus: string,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'payer_response_received', {
    payer_response_status: payerResponseStatus,
  });
}

export async function recordRecoveryOutcome(
  organizationId: string,
  claimId: string,
  recoveredAmountCents: number,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'recovered', {
    recovered_amount_cents: recoveredAmountCents,
    payer_response_status: 'recovered',
  });
}

export async function markLostOutcome(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'lost', {
    payer_response_status: 'lost',
  });
}

export async function writeOffOutcome(
  organizationId: string,
  claimId: string,
): Promise<AppealRecoveryCase> {
  return transitionAppealRecoveryCase(organizationId, claimId, 'written_off', {
    payer_response_status: 'written_off',
  });
}
