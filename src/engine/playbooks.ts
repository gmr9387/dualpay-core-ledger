/**
 * Recovery Playbook Engine
 *
 * For every denial category, a playbook defines the recommended
 * sequence of operational moves, required evidence, appeal strategy,
 * effort estimate, and expected recovery probability.  Pure data +
 * pure functions — every recommendation is explainable.
 */
import type { DenialCategory, DenialEvent, ClaimIntel } from '@/types/clarity';
import type { Claim } from '@/types/claim';

export type Effort = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlaybookStep {
  order: number;
  action: string;
  owner: string;
  rationale: string;
}

export interface Playbook {
  category: DenialCategory;
  title: string;
  summary: string;
  base_recovery_probability: number; // 0-1
  effort: Effort;
  estimated_minutes: number;
  required_evidence: string[];
  appeal_strategy: string;
  steps: PlaybookStep[];
  escalation_path: string;
}

const PB = (p: Playbook): Playbook => p;

export const PLAYBOOKS: Record<DenialCategory, Playbook> = {
  authorization: PB({
    category: 'authorization',
    title: 'Missing / Invalid Authorization',
    summary: 'Recover claims denied for missing precertification by surfacing existing auth or filing a retro-auth.',
    base_recovery_probability: 0.72,
    effort: 'MEDIUM', estimated_minutes: 35,
    required_evidence: ['Prior authorization number', 'Auth request documentation', 'Medical records supporting necessity'],
    appeal_strategy: 'Reconsideration with attached auth reference; if no auth, file retro-auth with clinical justification before formal appeal.',
    steps: [
      { order: 1, action: 'Search EMR + payer portal for an existing auth covering the dates of service.', owner: 'Authorization Team', rationale: 'Most auth denials are administrative — the auth exists but was not transmitted on the claim.' },
      { order: 2, action: 'If auth exists, attach reference number and resubmit corrected claim.', owner: 'Billing', rationale: 'Cheapest recovery — no formal appeal needed.' },
      { order: 3, action: 'If no auth, request retro-authorization with clinical documentation.', owner: 'Clinical Liaison', rationale: 'Most commercial payers allow retro-auth within 30-90 days when medically justified.' },
      { order: 4, action: 'If retro-auth denied, file Level 1 appeal citing medical necessity and absence of patient harm from administrative gap.', owner: 'Appeals', rationale: 'Auth-denied claims with strong clinical support are overturned at ~60% on appeal.' },
    ],
    escalation_path: 'Escalate to payer provider rep + JOC after two unsuccessful appeals.',
  }),
  medical_necessity: PB({
    category: 'medical_necessity',
    title: 'Medical Necessity Denial',
    summary: 'Clinical appeal supported by LCD/NCD citations, peer-reviewed evidence, and a physician letter.',
    base_recovery_probability: 0.55,
    effort: 'HIGH', estimated_minutes: 90,
    required_evidence: ['Complete clinical chart', 'Physician letter of medical necessity', 'LCD/NCD citation', 'Peer-reviewed literature (optional)'],
    appeal_strategy: 'Level 1 with clinical letter; if denied, escalate to peer-to-peer review before Level 2.',
    steps: [
      { order: 1, action: 'Pull the full chart for the date(s) of service.', owner: 'Clinical Liaison', rationale: 'Payers reject partial documentation outright.' },
      { order: 2, action: 'Cite the applicable LCD/NCD or payer medical policy that supports the service.', owner: 'Clinical Liaison', rationale: 'Anchoring to payer-published policy moves the conversation to objective criteria.' },
      { order: 3, action: 'Draft physician letter explaining clinical decision making.', owner: 'Clinical', rationale: 'Physician voice carries weight in medical necessity reviews.' },
      { order: 4, action: 'Submit Level 1 appeal packet.', owner: 'Appeals', rationale: 'Most overturns happen at Level 1 when documentation is complete.' },
      { order: 5, action: 'Request peer-to-peer review if denied.', owner: 'Clinical', rationale: 'P2P bypasses written review and gets a physician-level decision.' },
    ],
    escalation_path: 'External IRO review or state insurance commissioner complaint if exhausted internally.',
  }),
  timely_filing: PB({
    category: 'timely_filing',
    title: 'Timely Filing',
    summary: 'Only recoverable if you can prove on-time original submission. Otherwise write off.',
    base_recovery_probability: 0.18,
    effort: 'LOW', estimated_minutes: 15,
    required_evidence: ['Clearinghouse acknowledgement (999/277CA)', 'Original claim image', 'Payer EDI receipt'],
    appeal_strategy: 'Appeal only with clearinghouse confirmation. Without proof, do not waste cycles.',
    steps: [
      { order: 1, action: 'Pull clearinghouse acknowledgement for the original submission.', owner: 'Billing', rationale: 'A 277CA accepted within filing window is sufficient proof at most payers.' },
      { order: 2, action: 'If proof exists, file appeal with EDI receipt attached.', owner: 'Appeals', rationale: 'Payers routinely reverse timely filing denials when EDI proof is presented.' },
      { order: 3, action: 'If no proof, recommend write-off and root-cause the gap.', owner: 'Billing Lead', rationale: 'Pursuing without proof has near-zero ROI and creates appeal-cycle waste.' },
    ],
    escalation_path: 'Provider rep dispute if clearinghouse confirms acceptance but payer denies receipt.',
  }),
  missing_documentation: PB({
    category: 'missing_documentation',
    title: 'Documentation Deficiency',
    summary: 'Identify the missing field from RARC, attach, and resubmit within timely window.',
    base_recovery_probability: 0.80,
    effort: 'LOW', estimated_minutes: 20,
    required_evidence: ['Op note', 'Itemised bill', 'Requested documentation per RARC'],
    appeal_strategy: 'Corrected resubmission rather than formal appeal — keeps the claim in original adjudication track.',
    steps: [
      { order: 1, action: 'Read the RARC and payer message to identify exactly what is missing.', owner: 'Billing', rationale: 'Most doc-deficient denials specify the missing item; do not guess.' },
      { order: 2, action: 'Retrieve the document from EMR/HIM and attach.', owner: 'HIM', rationale: 'Avoids re-requesting from providers.' },
      { order: 3, action: 'Resubmit as a corrected claim (frequency code 7).', owner: 'Billing', rationale: 'Faster turnaround than appeal track.' },
    ],
    escalation_path: 'Escalate to payer rep if rejected after corrected submission.',
  }),
  coding: PB({
    category: 'coding',
    title: 'Coding Error',
    summary: 'Coder review of dx/procedure alignment and modifier usage, then corrected resubmission.',
    base_recovery_probability: 0.68,
    effort: 'MEDIUM', estimated_minutes: 30,
    required_evidence: ['Op note', 'ICD-10 documentation', 'Coding worksheet'],
    appeal_strategy: 'Corrected claim with coder rationale; appeal only if payer rejects the recoded version.',
    steps: [
      { order: 1, action: 'Coding QA re-reviews dx/procedure linkage and modifier usage.', owner: 'Coding QA', rationale: 'Catches the highest-impact corrections before resubmission.' },
      { order: 2, action: 'Resubmit corrected claim with frequency code 7.', owner: 'Billing', rationale: 'Bypasses appeal queue.' },
      { order: 3, action: 'If still denied, file appeal with coder narrative.', owner: 'Appeals', rationale: 'Many coding denials reverse with a written rationale.' },
    ],
    escalation_path: 'Compliance review if payer disputes well-supported coding repeatedly.',
  }),
  eligibility: PB({
    category: 'eligibility',
    title: 'Eligibility Dispute',
    summary: 'Re-verify coverage, correct demographics, redirect to actual payer if needed.',
    base_recovery_probability: 0.35,
    effort: 'LOW', estimated_minutes: 18,
    required_evidence: ['Eligibility verification', 'Member ID card', 'Subscriber confirmation'],
    appeal_strategy: 'Eligibility appeals rarely succeed; the better play is fast redirection to the correct payer.',
    steps: [
      { order: 1, action: 'Re-run eligibility for the date of service.', owner: 'Eligibility', rationale: 'Most eligibility denials are demographic mismatches.' },
      { order: 2, action: 'Correct member/subscriber data and resubmit.', owner: 'Billing', rationale: 'Resolves the majority of these denials administratively.' },
      { order: 3, action: 'If coverage truly terminated, redirect to active payer or patient.', owner: 'Patient Access', rationale: 'Protects timely filing on the correct payer.' },
    ],
    escalation_path: 'Patient Access workflow review to prevent recurrence.',
  }),
  cob: PB({
    category: 'cob',
    title: 'Coordination of Benefits',
    summary: 'Obtain primary EOB and resubmit as secondary with proper COB allocation.',
    base_recovery_probability: 0.82,
    effort: 'MEDIUM', estimated_minutes: 40,
    required_evidence: ['Primary EOB (or 835)', 'COB questionnaire', 'Coverage hierarchy verification'],
    appeal_strategy: 'COB rejections almost always resolve with primary EOB — do not file formal appeal until secondary resubmission is rejected.',
    steps: [
      { order: 1, action: 'Identify primary payer from OHI indicators or member call.', owner: 'COB', rationale: 'Most COB denials stem from primary payer not on file.' },
      { order: 2, action: 'Obtain primary EOB / 835.', owner: 'COB', rationale: 'Required for secondary adjudication.' },
      { order: 3, action: 'Resubmit secondary with primary allocation and source document attached.', owner: 'Billing', rationale: 'Triggers secondary adjudication path.' },
    ],
    escalation_path: 'Provider rep escalation if secondary continues to deny despite valid primary EOB.',
  }),
  modifier: PB({
    category: 'modifier',
    title: 'Modifier Error',
    summary: 'Coder review for correct modifier (25/59/LT/RT) and corrected resubmission.',
    base_recovery_probability: 0.74,
    effort: 'LOW', estimated_minutes: 22,
    required_evidence: ['Op note', 'CPT modifier guidance', 'NCCI edit lookup'],
    appeal_strategy: 'Resubmit corrected with proper modifier; formal appeal only if payer disputes documentation.',
    steps: [
      { order: 1, action: 'Coder confirms correct modifier per documentation.', owner: 'Coding', rationale: 'Most modifier denials are clerical.' },
      { order: 2, action: 'Resubmit corrected claim.', owner: 'Billing', rationale: 'Faster than appeal track.' },
    ],
    escalation_path: 'NCCI edit dispute if modifier is appropriate but payer disagrees with bundling.',
  }),
  duplicate: PB({
    category: 'duplicate',
    title: 'Duplicate Claim',
    summary: 'Confirm true duplicate vs. distinct service; modifier 76/77 + documentation if distinct.',
    base_recovery_probability: 0.30,
    effort: 'LOW', estimated_minutes: 12,
    required_evidence: ['Original claim ID', 'Service documentation proving distinct event'],
    appeal_strategy: 'Resubmit with modifier 76/77 + documentation, not formal appeal.',
    steps: [
      { order: 1, action: 'Compare to prior submission for the same DOS / member.', owner: 'Billing', rationale: 'Distinguish true duplicate from repeat procedure.' },
      { order: 2, action: 'If distinct, add modifier 76/77 and attach documentation.', owner: 'Coding', rationale: 'Standard mechanism for repeat services.' },
      { order: 3, action: 'If true duplicate, write off.', owner: 'Billing Lead', rationale: 'Cost of pursuit exceeds recovery.' },
    ],
    escalation_path: 'None — write off if no distinguishing evidence.',
  }),
  contractual: PB({
    category: 'contractual',
    title: 'Contractual Adjustment',
    summary: 'Write off per fee schedule unless underpayment is detected against contract terms.',
    base_recovery_probability: 0.05,
    effort: 'LOW', estimated_minutes: 5,
    required_evidence: ['Contract fee schedule'],
    appeal_strategy: 'No appeal. Open underpayment recovery only if paid amount is below contracted rate.',
    steps: [
      { order: 1, action: 'Verify paid amount against contracted fee schedule.', owner: 'Contract Mgmt', rationale: 'Distinguishes contractual write-off from underpayment.' },
      { order: 2, action: 'If correct, post adjustment. Otherwise open underpayment workflow.', owner: 'Billing', rationale: 'Avoids treating underpayment as standard contractual.' },
    ],
    escalation_path: 'Contract management review for systemic underpayment patterns.',
  }),
  bundled: PB({
    category: 'bundled',
    title: 'NCCI Bundling',
    summary: 'If services are clinically distinct, append modifier 59/XU with documentation.',
    base_recovery_probability: 0.48,
    effort: 'MEDIUM', estimated_minutes: 30,
    required_evidence: ['Op note', 'NCCI edit research', 'Anatomic / temporal distinction notes'],
    appeal_strategy: 'Corrected resubmission with unbundling modifier and documentation rationale.',
    steps: [
      { order: 1, action: 'Confirm NCCI edit applies and modifier override is allowed.', owner: 'Coding QA', rationale: 'Some edits are non-overridable; do not waste cycles.' },
      { order: 2, action: 'Append 59 / XE / XS / XP / XU modifier with documentation.', owner: 'Coding', rationale: 'X-modifiers are increasingly required over generic 59.' },
      { order: 3, action: 'Resubmit corrected; appeal if denied.', owner: 'Billing', rationale: 'Two-step approach minimises appeal queue.' },
    ],
    escalation_path: 'Coding compliance review if patterns suggest systemic edits.',
  }),
  coverage: PB({
    category: 'coverage',
    title: 'Non-Covered Service',
    summary: 'Verify benefits per SPD; appeal with SPD citation, otherwise bill patient or write off.',
    base_recovery_probability: 0.25,
    effort: 'MEDIUM', estimated_minutes: 30,
    required_evidence: ['Summary Plan Description excerpt', 'Plan benefit grid'],
    appeal_strategy: 'Appeal with SPD evidence; if truly excluded, route to patient billing or write-off.',
    steps: [
      { order: 1, action: 'Pull SPD for date of service.', owner: 'Billing', rationale: 'Plan terms govern; payer may misapply exclusion.' },
      { order: 2, action: 'Appeal with SPD citation if covered.', owner: 'Appeals', rationale: 'Plan-document arguments are the highest-leverage appeal angle.' },
      { order: 3, action: 'Otherwise transfer to patient responsibility or write off.', owner: 'Billing', rationale: 'Close the loop; do not leave in limbo.' },
    ],
    escalation_path: 'External review for plan-document disputes.',
  }),
  underpayment: PB({
    category: 'underpayment',
    title: 'Underpayment Recovery',
    summary: 'Cite contract fee schedule and request reprocessing for the variance.',
    base_recovery_probability: 0.70,
    effort: 'MEDIUM', estimated_minutes: 25,
    required_evidence: ['Contract fee schedule', 'EOB / 835', 'Variance calculation'],
    appeal_strategy: 'Contractual dispute (not clinical appeal); attach contract excerpt.',
    steps: [
      { order: 1, action: 'Compute variance: contracted allowable vs. paid.', owner: 'Contract Mgmt', rationale: 'Quantifies the dispute objectively.' },
      { order: 2, action: 'Submit underpayment dispute citing contract terms.', owner: 'Billing', rationale: 'Most payers honour clear contract math without formal appeal.' },
      { order: 3, action: 'Escalate to provider rep if not reprocessed in 30 days.', owner: 'Revenue Cycle Lead', rationale: 'Aging underpayments compound and indicate systemic issues.' },
    ],
    escalation_path: 'JOC + payer contracting team for recurring underpayment patterns.',
  }),
};

export interface PlaybookRecommendation {
  playbook: Playbook;
  expected_recovery_probability: number; // adjusted for claim signals
  adjustment_factors: Array<{ label: string; delta: number; detail: string }>;
  effort: Effort;
  estimated_minutes: number;
  identified_gaps: string[]; // missing evidence specific to this claim
}

export function recommendPlaybook(
  claim: Claim & { intel: ClaimIntel },
  denial?: DenialEvent,
): PlaybookRecommendation | null {
  const primary = denial ?? claim.intel.denial_events[0];
  if (!primary) return null;
  const pb = PLAYBOOKS[primary.category];
  if (!pb) return null;

  const adjustments: PlaybookRecommendation['adjustment_factors'] = [];
  let prob = pb.base_recovery_probability;

  if (claim.intel.aging_days > 120) { adjustments.push({ label: 'Aging', delta: -0.20, detail: `${claim.intel.aging_days}d past timely filing window` }); prob -= 0.20; }
  else if (claim.intel.aging_days > 90) { adjustments.push({ label: 'Aging', delta: -0.10, detail: `${claim.intel.aging_days}d` }); prob -= 0.10; }
  else if (claim.intel.aging_days < 30)  { adjustments.push({ label: 'Aging', delta: +0.05, detail: 'Fresh — full appeal window' }); prob += 0.05; }

  if (claim.intel.evidence_missing.length > 0) {
    const d = -0.05 * Math.min(claim.intel.evidence_missing.length, 4);
    adjustments.push({ label: 'Evidence gap', delta: d, detail: `${claim.intel.evidence_missing.length} required item(s) missing` });
    prob += d;
  }

  const priorDenied = claim.intel.appeals.filter(a => a.status === 'denied').length;
  if (priorDenied > 0) { adjustments.push({ label: 'Prior appeals', delta: -0.10 * priorDenied, detail: `${priorDenied} prior denial(s)` }); prob -= 0.10 * priorDenied; }

  if (claim.intel.payer_class === 'medicaid') { adjustments.push({ label: 'Payer', delta: -0.05, detail: 'Medicaid: stricter doc rules' }); prob -= 0.05; }
  if (claim.intel.payer_class === 'medicare') { adjustments.push({ label: 'Payer', delta: +0.03, detail: 'Medicare: rule-based adjudication' }); prob += 0.03; }

  const identified_gaps = pb.required_evidence.filter(e =>
    claim.intel.evidence_missing.some(m => m.toLowerCase().includes(e.toLowerCase().split(' ')[0]))
  );

  return {
    playbook: pb,
    expected_recovery_probability: Math.max(0, Math.min(1, prob)),
    adjustment_factors: adjustments,
    effort: pb.effort,
    estimated_minutes: pb.estimated_minutes,
    identified_gaps,
  };
}

export const EFFORT_CLS: Record<Effort, string> = {
  LOW:    'bg-status-paid/10 text-status-paid border-status-paid/30',
  MEDIUM: 'bg-status-pending/10 text-status-pending border-status-pending/30',
  HIGH:   'bg-status-denied/10 text-status-denied border-status-denied/30',
};
