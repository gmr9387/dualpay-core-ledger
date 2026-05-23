/**
 * Action Recommendation Engine
 *
 * Produces an explainable Next Best Action per claim/denial.
 * Every recommendation cites supporting evidence and the reasoning
 * path that led to it.  No black-box scoring.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel, DenialEvent } from '@/types/clarity';
import { explainRecoverability } from './recoverability';
import { recommendPlaybook } from './playbooks';
import { slaStatus } from '@/hooks/use-clarity-data';

export type ActionKind =
  | 'gather_authorization'
  | 'request_documentation'
  | 'correct_and_resubmit'
  | 'obtain_primary_eob'
  | 'file_appeal'
  | 'peer_to_peer'
  | 'escalate_internal'
  | 'escalate_payer_rep'
  | 'underpayment_dispute'
  | 'close_writeoff'
  | 'monitor';

export interface NextBestAction {
  kind: ActionKind;
  headline: string;
  owner: string;
  why: string[];          // bullet list of supporting reasoning
  expected_value_cents: number; // amount at risk × probability
  expected_probability: number; // 0-1
  evidence_refs: string[];      // documents this action depends on
  urgency: 'now' | 'this_week' | 'this_month' | 'when_able';
  effort_minutes: number;
}

const KIND_LABEL: Record<ActionKind, string> = {
  gather_authorization: 'Gather Authorization',
  request_documentation: 'Request Documentation',
  correct_and_resubmit: 'Correct & Resubmit',
  obtain_primary_eob: 'Obtain Primary EOB',
  file_appeal: 'File Appeal',
  peer_to_peer: 'Schedule Peer-to-Peer',
  escalate_internal: 'Escalate Internally',
  escalate_payer_rep: 'Escalate to Payer Rep',
  underpayment_dispute: 'Open Underpayment Dispute',
  close_writeoff: 'Close — Write Off',
  monitor: 'Monitor',
};

export function actionLabel(k: ActionKind): string { return KIND_LABEL[k]; }

export function nextBestAction(
  claim: Claim & { intel: ClaimIntel },
  denial?: DenialEvent,
): NextBestAction {
  const intel = claim.intel;
  const primary = denial ?? intel.denial_events[0];
  const exp = explainRecoverability(claim);
  const why: string[] = [];

  // No denial at all → monitor
  if (!primary) {
    return {
      kind: 'monitor', headline: 'Monitor — clean claim in adjudication.',
      owner: 'Billing', why: ['No denial events recorded.', `Reimbursement state: ${intel.reimbursement_state}.`],
      expected_value_cents: 0, expected_probability: 0, evidence_refs: [], urgency: 'when_able', effort_minutes: 5,
    };
  }

  const rec = recommendPlaybook(claim, primary);
  const prob = rec?.expected_recovery_probability ?? primary.recoverability_score / 100;
  const expectedValue = Math.round(intel.amount_at_risk_cents * prob);

  // Aging past filing window with no prior appeal proof → write off
  if (primary.category === 'timely_filing' && intel.aging_days > 120 && intel.evidence_missing.length > 0) {
    why.push(`Claim is ${intel.aging_days}d old — past timely filing for most payers.`);
    why.push('No proof of timely original submission on file.');
    why.push('Pursuit ROI is below operational threshold.');
    return {
      kind: 'close_writeoff', headline: 'Recommend write-off — no recoverable path.', owner: 'Billing Lead',
      why, expected_value_cents: 0, expected_probability: 0.05, evidence_refs: [],
      urgency: 'this_week', effort_minutes: 5,
    };
  }

  // Contractual with no underpayment signal
  if (primary.category === 'contractual' && intel.underpayment_cents <= 0) {
    why.push('Adjustment matches contracted fee schedule.');
    why.push('No underpayment variance detected.');
    return {
      kind: 'close_writeoff', headline: 'Post contractual adjustment — no appeal indicated.', owner: 'Billing',
      why, expected_value_cents: 0, expected_probability: 0, evidence_refs: ['Contract fee schedule'],
      urgency: 'when_able', effort_minutes: 3,
    };
  }

  // Underpayment detected
  if (intel.underpayment_cents > 0 && primary.category !== 'underpayment') {
    why.push(`Paid amount is ${Math.round(intel.underpayment_cents/100).toLocaleString()} dollars below expected contractual.`);
    why.push('Underpayment disputes resolve at ~70% without formal appeal.');
    return {
      kind: 'underpayment_dispute', headline: 'Open underpayment dispute — cite contract.', owner: 'Contract Management',
      why, expected_value_cents: intel.underpayment_cents, expected_probability: 0.7,
      evidence_refs: ['Contract fee schedule', 'EOB / 835', 'Variance calculation'],
      urgency: 'this_week', effort_minutes: 25,
    };
  }

  // COB with missing primary EOB
  if (primary.category === 'cob' && intel.evidence_missing.some(e => /primary|eob/i.test(e))) {
    why.push('Denial cites coordination of benefits.');
    why.push('Primary EOB not yet on file — blocks secondary adjudication.');
    why.push(`Playbook base recovery for COB is ${Math.round((rec?.playbook.base_recovery_probability ?? 0.8) * 100)}%.`);
    return {
      kind: 'obtain_primary_eob', headline: 'Obtain primary EOB then resubmit as secondary.', owner: 'COB Team',
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: ['Primary EOB (or 835)', 'COB questionnaire'],
      urgency: 'this_week', effort_minutes: 40,
    };
  }

  // Authorization missing
  if (primary.category === 'authorization') {
    const sla = slaStatus(intel.sla_due_at);
    why.push('Denial code indicates missing precertification.');
    why.push('Most auth denials are administrative — auth often exists.');
    if (sla.tone === 'breach' || sla.tone === 'warn') why.push(`SLA ${sla.label} — act now to preserve appeal window.`);
    return {
      kind: 'gather_authorization', headline: 'Search for existing auth; if absent, file retro-auth.', owner: 'Authorization Team',
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: ['Prior authorization number', 'Medical records'],
      urgency: sla.tone === 'breach' ? 'now' : 'this_week',
      effort_minutes: 30,
    };
  }

  // Missing documentation — request it
  if (intel.evidence_missing.length > 0 && primary.appeal_eligible) {
    why.push(`${intel.evidence_missing.length} required evidence item(s) missing.`);
    why.push('Appeal readiness blocked until documentation is complete.');
    if (exp.tier === 'HIGH') why.push('Recoverability tier HIGH — worth chasing documents quickly.');
    return {
      kind: 'request_documentation', headline: 'Close documentation gaps before appeal.', owner: 'HIM / Clinical',
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: intel.evidence_missing, urgency: 'this_week', effort_minutes: 25,
    };
  }

  // Coding / modifier — correct & resubmit
  if (primary.category === 'coding' || primary.category === 'modifier' || primary.category === 'eligibility') {
    why.push(`${primary.category} denials typically resolve via corrected resubmission, not appeal.`);
    why.push('Bypasses appeal queue and preserves timely filing.');
    return {
      kind: 'correct_and_resubmit', headline: `Resubmit corrected claim (${primary.category}).`, owner: primary.workflow_owner,
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: primary.evidence_required, urgency: 'this_week', effort_minutes: 22,
    };
  }

  // Medical necessity with prior denied appeal → peer to peer
  if (primary.category === 'medical_necessity' && intel.appeals.some(a => a.status === 'denied')) {
    why.push('Medical necessity already denied at Level 1.');
    why.push('Peer-to-peer review historically overturns ~45% of these.');
    return {
      kind: 'peer_to_peer', headline: 'Request peer-to-peer review.', owner: 'Clinical',
      why, expected_value_cents: expectedValue, expected_probability: 0.45,
      evidence_refs: ['Complete clinical chart', 'LCD/NCD citation'],
      urgency: 'this_week', effort_minutes: 60,
    };
  }

  // SLA breach + high value → escalate
  const sla = slaStatus(intel.sla_due_at);
  if ((sla.tone === 'breach' || intel.is_stalled) && intel.amount_at_risk_cents >= 500_000) {
    why.push(`High-value claim (${(intel.amount_at_risk_cents/100).toLocaleString()} dollars at risk).`);
    why.push(sla.tone === 'breach' ? `SLA breached: ${sla.label}.` : 'Claim flagged as stalled.');
    why.push('Internal escalation triggers manager review and payer rep engagement.');
    return {
      kind: 'escalate_internal', headline: 'Escalate to operations lead.', owner: 'Reimbursement Manager',
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: ['Claim summary', 'Denial detail'],
      urgency: 'now', effort_minutes: 10,
    };
  }

  // Default — file appeal
  if (primary.appeal_eligible) {
    const level = (intel.appeals.length + 1) as 1 | 2 | 3;
    why.push(`Appeal eligible per ${primary.carc_code}${primary.rarc_code ? '/' + primary.rarc_code : ''}.`);
    why.push(`Playbook expects ${Math.round(prob * 100)}% recovery probability.`);
    why.push(intel.evidence_missing.length === 0 ? 'All required evidence already on file.' : `${intel.evidence_missing.length} evidence item(s) still outstanding.`);
    return {
      kind: 'file_appeal', headline: `File Level ${level} appeal with attached evidence.`, owner: 'Appeals',
      why, expected_value_cents: expectedValue, expected_probability: prob,
      evidence_refs: primary.evidence_required, urgency: sla.tone === 'breach' ? 'now' : 'this_week',
      effort_minutes: rec?.estimated_minutes ?? 45,
    };
  }

  // Fallback
  return {
    kind: 'monitor', headline: 'Monitor — no automated action recommended.', owner: 'Billing',
    why: ['Denial is not appeal-eligible.', 'No documentation gap or underpayment detected.'],
    expected_value_cents: 0, expected_probability: prob, evidence_refs: [],
    urgency: 'when_able', effort_minutes: 5,
  };
}

export const URGENCY_CLS: Record<NextBestAction['urgency'], string> = {
  now:         'bg-status-denied/15 text-status-denied border-status-denied/30',
  this_week:   'bg-status-pending/15 text-status-pending border-status-pending/30',
  this_month:  'bg-status-cob/10 text-status-cob border-status-cob/30',
  when_able:   'bg-muted text-muted-foreground border-border',
};

export const URGENCY_LABEL: Record<NextBestAction['urgency'], string> = {
  now: 'Now', this_week: 'This Week', this_month: 'This Month', when_able: 'When Able',
};
