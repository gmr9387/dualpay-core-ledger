/**
 * Denial Intelligence Engine
 *
 * Maps CARC/RARC codes to operational denial categories, severity,
 * recoverability scoring, and recommended actions.  Pure functions —
 * no I/O, deterministic, suitable for batch scoring or live triage.
 */

import type {
  ClaimIntel,
  DenialCategory,
  DenialEvent,
  DenialSeverity,
  WorkflowOwner,
  WorkQueueId,
  AgingBucket,
} from '@/types/clarity';

// ── CARC/RARC taxonomy ────────────────────────────────────────

export interface DenialTaxonomyEntry {
  carc: string;
  rarc?: string;
  category: DenialCategory;
  base_recoverability: number; // 0-100 baseline before aging/value adjustments
  workflow_owner: WorkflowOwner;
  appeal_eligible: boolean;
  evidence_required: string[];
  description: string;
  recommended_action: string;
}

export const DENIAL_TAXONOMY: DenialTaxonomyEntry[] = [
  // Authorization
  { carc: '197', category: 'authorization', base_recoverability: 75, workflow_owner: 'auth_team', appeal_eligible: true,
    evidence_required: ['Prior authorization number', 'Medical records', 'Auth request documentation'],
    description: 'Precertification/authorization/notification absent',
    recommended_action: 'Verify if auth was obtained; if so, attach reference number and resubmit. Otherwise file retro-auth.' },
  { carc: '198', category: 'authorization', base_recoverability: 60, workflow_owner: 'auth_team', appeal_eligible: true,
    evidence_required: ['Auth number', 'Service documentation'],
    description: 'Precertification exceeded',
    recommended_action: 'Request extension; attach documentation supporting medical necessity of extended care.' },

  // Eligibility
  { carc: '27', category: 'eligibility', base_recoverability: 35, workflow_owner: 'eligibility', appeal_eligible: false,
    evidence_required: ['Eligibility verification', 'Member ID card copy'],
    description: 'Expenses incurred after coverage terminated',
    recommended_action: 'Re-verify coverage dates. If patient had active coverage elsewhere, redirect to correct payer.' },
  { carc: '31', category: 'eligibility', base_recoverability: 40, workflow_owner: 'eligibility', appeal_eligible: false,
    evidence_required: ['Eligibility verification screenshot'],
    description: 'Patient cannot be identified as our insured',
    recommended_action: 'Confirm member ID, DOB, subscriber. Resubmit with corrected demographics.' },

  // COB
  { carc: '22', category: 'cob', base_recoverability: 85, workflow_owner: 'cob_team', appeal_eligible: false,
    evidence_required: ['Primary EOB', 'COB questionnaire'],
    description: 'This care may be covered by another payer per COB',
    recommended_action: 'Obtain primary EOB and resubmit as secondary with COB allocation.' },
  { carc: '23', category: 'cob', base_recoverability: 80, workflow_owner: 'cob_team', appeal_eligible: false,
    evidence_required: ['Primary EOB'],
    description: 'Impact of prior payer adjudication',
    recommended_action: 'Confirm primary EOB attached; re-run secondary adjudication.' },

  // Modifier
  { carc: '4', category: 'modifier', base_recoverability: 70, workflow_owner: 'coder', appeal_eligible: true,
    evidence_required: ['Op note', 'Procedure documentation'],
    description: 'Procedure code inconsistent with modifier used',
    recommended_action: 'Coder review: correct modifier (likely 25, 59, or LT/RT) and resubmit corrected claim.' },
  { carc: '4', rarc: 'M77', category: 'modifier', base_recoverability: 78, workflow_owner: 'coder', appeal_eligible: true,
    evidence_required: ['Op note'],
    description: 'Missing/incomplete/invalid modifier',
    recommended_action: 'Add appropriate modifier per CPT guidelines; resubmit.' },

  // Duplicate
  { carc: '18', category: 'duplicate', base_recoverability: 20, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['Original claim ID', 'Proof of distinct service'],
    description: 'Exact duplicate claim/service',
    recommended_action: 'Verify against prior submissions. If true duplicate, write off. If distinct, add 76/77 modifier with documentation.' },

  // Medical necessity
  { carc: '50', category: 'medical_necessity', base_recoverability: 55, workflow_owner: 'clinical', appeal_eligible: true,
    evidence_required: ['Clinical notes', 'Lab results', 'Imaging reports', 'LCD/NCD citation'],
    description: 'Non-covered services — not deemed medically necessary',
    recommended_action: 'Clinical appeal with full chart, supporting LCDs, and physician letter of medical necessity.' },

  // Missing documentation
  { carc: '16', rarc: 'N657', category: 'missing_documentation', base_recoverability: 80, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['Op note', 'Pathology report'],
    description: 'Claim/service lacks information needed for adjudication',
    recommended_action: 'Identify missing field from RARC, attach, and resubmit within timely filing window.' },
  { carc: '16', category: 'missing_documentation', base_recoverability: 75, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['Requested documentation per payer'],
    description: 'Claim lacks information or has submission error',
    recommended_action: 'Review payer message; resubmit with missing information.' },

  // Timely filing
  { carc: '29', category: 'timely_filing', base_recoverability: 15, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['Proof of original submission', 'Clearinghouse acknowledgement'],
    description: 'Time limit for filing has expired',
    recommended_action: 'If proof of timely original submission exists, appeal with clearinghouse confirmation. Otherwise write off.' },

  // Contractual
  { carc: '45', category: 'contractual', base_recoverability: 0, workflow_owner: 'biller', appeal_eligible: false,
    evidence_required: [],
    description: 'Charges exceed fee schedule / contracted amount',
    recommended_action: 'Contractual write-off per fee schedule. No appeal.' },

  // Bundled
  { carc: '97', category: 'bundled', base_recoverability: 45, workflow_owner: 'coder', appeal_eligible: true,
    evidence_required: ['Op note', 'NCCI edit research'],
    description: 'Benefit included in allowance for another service',
    recommended_action: 'Verify NCCI bundling. If services are distinct, append modifier 59/XU with documentation.' },

  // Coding
  { carc: '11', category: 'coding', base_recoverability: 65, workflow_owner: 'coder', appeal_eligible: true,
    evidence_required: ['Op note', 'ICD-10 documentation'],
    description: 'Diagnosis inconsistent with procedure',
    recommended_action: 'Coder review: align dx with procedure per LCD. Resubmit corrected.' },

  // Coverage
  { carc: '96', rarc: 'N20', category: 'coverage', base_recoverability: 25, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['SPD excerpt', 'Plan benefits'],
    description: 'Non-covered charge',
    recommended_action: 'Verify benefits. If covered per SPD, appeal with SPD reference. Otherwise patient bill or write off.' },

  // Underpayment marker (synthesized, not a real CARC)
  { carc: 'UNDERPAY', category: 'underpayment', base_recoverability: 70, workflow_owner: 'biller', appeal_eligible: true,
    evidence_required: ['Contract fee schedule', 'EOB'],
    description: 'Paid amount below expected contractual rate',
    recommended_action: 'Open underpayment recovery: cite contract terms and request reprocessing.' },
];

export function lookupDenialEntry(carc: string, rarc?: string): DenialTaxonomyEntry | undefined {
  const exact = DENIAL_TAXONOMY.find(t => t.carc === carc && t.rarc === rarc);
  if (exact) return exact;
  return DENIAL_TAXONOMY.find(t => t.carc === carc);
}

// ── Scoring ───────────────────────────────────────────────────

/**
 * Severity is a function of amount-at-risk and recoverability.
 * Big money + high recoverability = critical (worth chasing).
 * Big money + low recoverability = high (escalation needed).
 * Small money + low recoverability = low (likely write-off).
 */
export function computeSeverity(amountAtRiskCents: number, recoverability: number): DenialSeverity {
  const dollars = amountAtRiskCents / 100;
  if (dollars >= 5000 && recoverability >= 50) return 'critical';
  if (dollars >= 5000) return 'high';
  if (dollars >= 1500 && recoverability >= 40) return 'high';
  if (dollars >= 500) return 'medium';
  return 'low';
}

/**
 * Adjusts taxonomy base recoverability for aging and prior appeal history.
 * Older claims and previously-denied appeals lower recoverability.
 */
export function adjustRecoverability(
  base: number,
  agingDays: number,
  priorAppealsDenied: number,
): number {
  let score = base;
  if (agingDays > 120) score -= 25;
  else if (agingDays > 90) score -= 15;
  else if (agingDays > 60) score -= 8;
  else if (agingDays > 30) score -= 3;
  score -= priorAppealsDenied * 12;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return '120+';
}

/**
 * Determine which work queues a claim belongs to.
 * A claim can appear in multiple queues simultaneously.
 */
export function deriveQueues(intel: Pick<ClaimIntel,
  'reimbursement_state' | 'amount_at_risk_cents' | 'evidence_missing' |
  'appeals' | 'aging_days' | 'is_escalated' | 'is_stalled' | 'denial_events'
>): WorkQueueId[] {
  const q: WorkQueueId[] = [];
  if (intel.denial_events.length > 0 && intel.reimbursement_state !== 'resolved' && intel.reimbursement_state !== 'paid') {
    q.push('unresolved_denials');
  }
  if (intel.amount_at_risk_cents >= 250000) q.push('high_value');
  if (intel.appeals.some(a => a.status === 'submitted' || a.status === 'in_review' || a.status === 'draft')) {
    q.push('appeals_in_progress');
  }
  if (intel.evidence_missing.length > 0) q.push('missing_docs');
  if (intel.is_stalled) q.push('stalled');
  if (intel.is_escalated) q.push('escalation');
  if (intel.aging_days >= 60) q.push('aging');
  if (intel.reimbursement_state === 'pending_payer' && intel.aging_days >= 21) q.push('payer_follow_up');
  return q;
}

/**
 * Compute SLA due date based on severity and queue urgency.
 * Returned as ISO string.
 */
export function computeSlaDueAt(submittedAt: string, severity: DenialSeverity): string {
  const baseDays = severity === 'critical' ? 2 : severity === 'high' ? 5 : severity === 'medium' ? 10 : 21;
  const d = new Date(submittedAt);
  d.setDate(d.getDate() + baseDays);
  return d.toISOString();
}

/**
 * Hydrate a raw denial (CARC/RARC + amount) into a fully-scored DenialEvent.
 */
export function scoreDenial(args: {
  denial_id: string;
  claim_id: string;
  line_id?: string;
  occurred_at: string;
  carc: string;
  rarc?: string;
  group_code: DenialEvent['group_code'];
  amount_cents: number;
  payer_message?: string;
  aging_days: number;
  prior_appeals_denied?: number;
}): DenialEvent {
  const entry = lookupDenialEntry(args.carc, args.rarc) ?? {
    carc: args.carc,
    category: 'coverage' as DenialCategory,
    base_recoverability: 30,
    workflow_owner: 'biller' as WorkflowOwner,
    appeal_eligible: true,
    evidence_required: ['Payer message review'],
    description: `Denial CARC ${args.carc}`,
    recommended_action: 'Research denial reason and determine next action.',
  };
  const recoverability = adjustRecoverability(
    entry.base_recoverability,
    args.aging_days,
    args.prior_appeals_denied ?? 0,
  );
  const severity = computeSeverity(args.amount_cents, recoverability);
  return {
    denial_id: args.denial_id,
    claim_id: args.claim_id,
    line_id: args.line_id,
    occurred_at: args.occurred_at,
    carc_code: args.carc,
    rarc_code: args.rarc,
    group_code: args.group_code,
    amount_cents: args.amount_cents,
    category: entry.category,
    severity,
    recoverability_score: recoverability,
    root_cause: entry.description,
    recommended_action: entry.recommended_action,
    workflow_owner: entry.workflow_owner,
    appeal_eligible: entry.appeal_eligible,
    evidence_required: entry.evidence_required,
    payer_message: args.payer_message,
  };
}

export const CATEGORY_LABEL: Record<DenialCategory, string> = {
  authorization: 'Authorization',
  eligibility: 'Eligibility',
  cob: 'Coordination of Benefits',
  modifier: 'Modifier',
  duplicate: 'Duplicate',
  medical_necessity: 'Medical Necessity',
  missing_documentation: 'Missing Documentation',
  timely_filing: 'Timely Filing',
  contractual: 'Contractual',
  bundled: 'Bundled / NCCI',
  coding: 'Coding',
  coverage: 'Coverage',
  underpayment: 'Underpayment',
};

export const SEVERITY_LABEL: Record<DenialSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const QUEUE_LABEL: Record<WorkQueueId, string> = {
  unresolved_denials: 'Unresolved Denials',
  high_value: 'High-Value Claims',
  appeals_in_progress: 'Appeals in Progress',
  missing_docs: 'Missing Documentation',
  stalled: 'Stalled Reimbursements',
  escalation: 'Escalation Required',
  aging: 'Aging Claims',
  payer_follow_up: 'Payer Follow-up',
};

export const OWNER_LABEL: Record<WorkflowOwner, string> = {
  biller: 'Billing',
  coder: 'Coding',
  auth_team: 'Authorization',
  clinical: 'Clinical',
  appeals: 'Appeals',
  cob_team: 'COB',
  eligibility: 'Eligibility',
  unassigned: 'Unassigned',
};
