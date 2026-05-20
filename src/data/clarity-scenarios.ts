/**
 * Claim Clarity — synthetic operational dataset.
 *
 * Generates 28 interconnected claims across 6 payers with realistic
 * denial reasons, aging buckets, recoverability, and reimbursement
 * states.  Deterministic (seeded RNG) so reload behavior is stable.
 */

import type { Claim, ClaimLine, MemberAccumulators } from '@/types/claim';
import type {
  ClaimIntel,
  DenialEvent,
  PayerResponse,
  ReimbursementTimelineEvent,
  Appeal,
  ReimbursementState,
  WorkflowOwner,
} from '@/types/clarity';
import {
  scoreDenial,
  agingBucket,
  deriveQueues,
  computeSeverity,
  computeSlaDueAt,
} from '@/engine/denial-intelligence';

// ── seeded RNG ────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const between = (lo: number, hi: number) => Math.floor(rng() * (hi - lo + 1)) + lo;

// ── reference data ────────────────────────────────────────────
const PAYERS = [
  { id: 'BCBS-NC',     name: 'BlueCross BlueShield NC',      cls: 'commercial' as const, avgDays: 18, denialRate: 0.11 },
  { id: 'AETNA',       name: 'Aetna',                          cls: 'commercial' as const, avgDays: 22, denialRate: 0.14 },
  { id: 'UHC',         name: 'UnitedHealthcare',               cls: 'commercial' as const, avgDays: 26, denialRate: 0.16 },
  { id: 'MEDICARE',    name: 'Medicare (CMS)',                 cls: 'medicare'   as const, avgDays: 14, denialRate: 0.08 },
  { id: 'MEDICAID-NC', name: 'NC Medicaid',                    cls: 'medicaid'   as const, avgDays: 30, denialRate: 0.19 },
  { id: 'CIGNA',       name: 'Cigna',                          cls: 'commercial' as const, avgDays: 21, denialRate: 0.13 },
];

const PROVIDERS = [
  { npi: '1234567890', name: 'Dr. Sarah Chen',      facility: 'Metro Health Clinic' },
  { npi: '9876543210', name: 'Dr. James Park',      facility: 'Valley Medical Group' },
  { npi: '5555555555', name: 'Dr. Maria Lopez',     facility: 'Riverside Family Practice' },
  { npi: '2468013579', name: 'Dr. Anand Patel',     facility: 'Northside Orthopedics' },
  { npi: '1357924680', name: 'Dr. Kenji Watanabe',  facility: 'Lakeshore Cardiology' },
  { npi: '8642097531', name: 'Dr. Olivia Reyes',    facility: 'Coastal Imaging Center' },
];

// procedure code -> (billed range cents, expected reimbursement ratio)
const PROCEDURES: Array<[string, [number, number], number, string[]]> = [
  ['99213', [12000, 18000], 0.62, ['Z00.00', 'J06.9']],
  ['99214', [18000, 28000], 0.60, ['M54.5', 'I10']],
  ['99215', [25000, 38000], 0.58, ['E11.9', 'I25.10']],
  ['99203', [15000, 22000], 0.61, ['Z00.00']],
  ['99204', [22000, 32000], 0.60, ['R07.9', 'I20.9']],
  ['85025', [3500, 5500],   0.55, ['D64.9']],
  ['80053', [4200, 6800],   0.55, ['E78.5']],
  ['71046', [9500, 14000],  0.50, ['J18.9', 'R05.9']],
  ['73721', [85000, 120000], 0.48, ['M25.561', 'M17.11']],
  ['29881', [320000, 480000], 0.45, ['S83.241A']],
  ['45378', [180000, 260000], 0.50, ['Z12.11']],
  ['93000', [4500, 6500],   0.55, ['I49.9']],
  ['72148', [120000, 180000], 0.46, ['M54.16', 'M51.36']],
];

// Denial archetypes — (carc, rarc?, group, payerMessage)
const DENIAL_ARCHETYPES = [
  { carc: '197', group: 'CO' as const, msg: 'Precertification required for this service was not obtained prior to delivery.' },
  { carc: '198', group: 'CO' as const, msg: 'Authorization on file expired prior to date of service.' },
  { carc: '27',  group: 'PR' as const, msg: 'Patient coverage was terminated on 2024-08-31, prior to DOS.' },
  { carc: '22',  group: 'OA' as const, msg: 'Patient indicates other primary coverage. Submit primary EOB.' },
  { carc: '4',   group: 'CO' as const, rarc: 'M77', msg: 'Modifier 25 required for E/M billed with same-day procedure.' },
  { carc: '18',  group: 'CO' as const, msg: 'Exact duplicate of claim 0023841 received 2024-10-02.' },
  { carc: '50',  group: 'CO' as const, msg: 'Service not considered medically necessary per LCD L37354.' },
  { carc: '16',  group: 'CO' as const, rarc: 'N657', msg: 'Operative report required for adjudication.' },
  { carc: '29',  group: 'CO' as const, msg: 'Claim received beyond 180-day timely filing limit.' },
  { carc: '97',  group: 'CO' as const, msg: 'Payment bundled with 99214 billed same DOS per NCCI.' },
  { carc: '11',  group: 'CO' as const, msg: 'Diagnosis code Z00.00 does not support medical necessity of imaging.' },
  { carc: '96',  group: 'PR' as const, rarc: 'N20', msg: 'Service excluded from member plan benefits.' },
];

const PROVIDER_MEMBERS = Array.from({ length: 28 }, (_, i) => `MEM-${String(70000 + i * 137).padStart(5, '0')}`);

function isoDaysAgo(days: number): string {
  const d = new Date('2024-11-15T09:00:00Z');
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function isoDateAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

function genLines(claimId: string, lineCount: number): { lines: ClaimLine[]; totalBilled: number } {
  const lines: ClaimLine[] = [];
  let totalBilled = 0;
  for (let i = 0; i < lineCount; i++) {
    const [code, [lo, hi], , dx] = pick(PROCEDURES);
    const billed = between(lo, hi);
    totalBilled += billed;
    const dos = isoDateAgo(between(15, 200));
    lines.push({
      line_id: `L${i + 1}-${claimId.slice(-3)}`,
      claim_id: claimId,
      service_date: dos,
      claim_line_number: i + 1,
      procedure_code: code,
      diagnosis_codes: dx,
      billed_amount: billed,
      units: 1,
      place_of_service: pick(['11', '22', '23', '21']),
    });
  }
  return { lines, totalBilled };
}

interface GenSpec {
  state: ReimbursementState;
  agingDays: number;
  denialCount: 0 | 1 | 2 | 3;
  hasAppeal?: boolean;
  appealStatus?: Appeal['status'];
  underpaid?: boolean;
  missingDocs?: string[];
  escalated?: boolean;
  stalled?: boolean;
}

// 28 scenarios — designed for variety across modules
const SCENARIOS: GenSpec[] = [
  { state: 'denied',         agingDays: 12,  denialCount: 1 }, // fresh auth denial
  { state: 'denied',         agingDays: 45,  denialCount: 2, missingDocs: ['Operative report'] },
  { state: 'appealing',      agingDays: 78,  denialCount: 1, hasAppeal: true, appealStatus: 'in_review' },
  { state: 'partially_paid', agingDays: 33,  denialCount: 1, underpaid: true },
  { state: 'pending_payer',  agingDays: 28,  denialCount: 0, stalled: true },
  { state: 'denied',         agingDays: 95,  denialCount: 2, escalated: true, missingDocs: ['Primary EOB'] },
  { state: 'paid',           agingDays: 22,  denialCount: 0 },
  { state: 'denied',         agingDays: 130, denialCount: 1, escalated: true }, // timely filing risk
  { state: 'appealing',      agingDays: 55,  denialCount: 1, hasAppeal: true, appealStatus: 'submitted' },
  { state: 'partially_paid', agingDays: 41,  denialCount: 2, underpaid: true, missingDocs: ['Itemized bill'] },
  { state: 'denied',         agingDays: 18,  denialCount: 1 },
  { state: 'pending_payer',  agingDays: 8,   denialCount: 0 },
  { state: 'denied',         agingDays: 67,  denialCount: 3, escalated: true },
  { state: 'paid',           agingDays: 16,  denialCount: 0 },
  { state: 'appealing',      agingDays: 102, denialCount: 1, hasAppeal: true, appealStatus: 'draft', missingDocs: ['Letter of medical necessity'] },
  { state: 'partially_paid', agingDays: 25,  denialCount: 1, underpaid: true },
  { state: 'denied',         agingDays: 38,  denialCount: 1 },
  { state: 'pending_payer',  agingDays: 49,  denialCount: 0, stalled: true },
  { state: 'denied',         agingDays: 88,  denialCount: 2, escalated: true },
  { state: 'appealing',      agingDays: 60,  denialCount: 1, hasAppeal: true, appealStatus: 'approved' },
  { state: 'paid',           agingDays: 30,  denialCount: 0 },
  { state: 'denied',         agingDays: 14,  denialCount: 1 },
  { state: 'partially_paid', agingDays: 72,  denialCount: 2, underpaid: true, escalated: true },
  { state: 'pending_payer',  agingDays: 35,  denialCount: 0, stalled: true },
  { state: 'denied',         agingDays: 21,  denialCount: 1, missingDocs: ['Modifier documentation'] },
  { state: 'appealing',      agingDays: 90,  denialCount: 1, hasAppeal: true, appealStatus: 'denied' },
  { state: 'paid',           agingDays: 12,  denialCount: 0 },
  { state: 'denied',         agingDays: 155, denialCount: 1, escalated: true, missingDocs: ['Proof of timely submission'] },
];

function generateClaim(idx: number, spec: GenSpec): Claim {
  const seq = 100 + idx;
  const claim_id = `CLM-2024-${String(seq).padStart(5, '0')}`;
  const member_id = PROVIDER_MEMBERS[idx];
  const provider = pick(PROVIDERS);
  const payer = pick(PAYERS);
  const lineCount = between(1, 3);
  const { lines, totalBilled } = genLines(claim_id, lineCount);
  const submittedAt = isoDaysAgo(spec.agingDays);
  const expectedRatio = 0.55;
  const expected = Math.round(totalBilled * expectedRatio);

  // Denial events
  const denial_events: DenialEvent[] = [];
  let totalDeniedCents = 0;
  for (let i = 0; i < spec.denialCount; i++) {
    const arche = pick(DENIAL_ARCHETYPES);
    const targetLine = lines[i % lines.length];
    const amt = i === 0
      ? Math.round(targetLine.billed_amount * expectedRatio)
      : Math.round(targetLine.billed_amount * 0.18);
    totalDeniedCents += amt;
    denial_events.push(scoreDenial({
      denial_id: `DNL-${claim_id.slice(-5)}-${i + 1}`,
      claim_id,
      line_id: targetLine.line_id,
      occurred_at: isoDaysAgo(spec.agingDays - between(2, 5)),
      carc: arche.carc,
      rarc: arche.rarc,
      group_code: arche.group,
      amount_cents: amt,
      payer_message: arche.msg,
      aging_days: spec.agingDays,
      prior_appeals_denied: spec.appealStatus === 'denied' ? 1 : 0,
    }));
  }

  // Underpayment synthetic denial
  let actual = expected;
  let underpayment = 0;
  if (spec.underpaid) {
    underpayment = Math.round(expected * between(15, 35) / 100);
    actual = expected - underpayment;
    denial_events.push(scoreDenial({
      denial_id: `DNL-${claim_id.slice(-5)}-UP`,
      claim_id,
      occurred_at: isoDaysAgo(spec.agingDays - 4),
      carc: 'UNDERPAY',
      group_code: 'CO',
      amount_cents: underpayment,
      payer_message: `Paid ${(actual / 100).toFixed(2)} vs. expected ${(expected / 100).toFixed(2)} per contract fee schedule.`,
      aging_days: spec.agingDays,
    }));
  } else if (spec.state === 'paid') {
    actual = expected;
  } else if (spec.state === 'denied') {
    actual = 0;
  } else if (spec.state === 'pending_payer' || spec.state === 'appealing') {
    actual = 0;
  }

  // Payer responses (always at least an ACK and a final response if non-pending)
  const payer_responses: PayerResponse[] = [
    {
      response_id: `RSP-${claim_id.slice(-5)}-ACK`,
      claim_id,
      payer_id: payer.id,
      payer_name: payer.name,
      received_at: isoDaysAgo(spec.agingDays - 1),
      response_type: 'ACK',
      billed_cents: totalBilled, allowed_cents: 0, paid_cents: 0,
      patient_resp_cents: 0, adjustment_cents: 0,
      source: 'edi_835',
    },
  ];
  if (spec.state !== 'pending_payer') {
    const allowed = Math.round(totalBilled * expectedRatio);
    payer_responses.push({
      response_id: `RSP-${claim_id.slice(-5)}-FIN`,
      claim_id,
      payer_id: payer.id,
      payer_name: payer.name,
      received_at: isoDaysAgo(Math.max(1, spec.agingDays - between(7, 14))),
      response_type: spec.state === 'denied' ? 'DENIAL'
        : spec.state === 'partially_paid' ? 'PARTIAL_PAY'
        : spec.state === 'paid' ? 'EOB_835'
        : 'ADJUSTMENT',
      billed_cents: totalBilled,
      allowed_cents: allowed,
      paid_cents: actual,
      patient_resp_cents: Math.max(0, allowed - actual),
      adjustment_cents: totalBilled - allowed,
      source: 'edi_835',
    });
  }

  // Timeline
  const timeline: ReimbursementTimelineEvent[] = [
    { event_id: `TL-${claim_id}-1`, claim_id, occurred_at: submittedAt,
      kind: 'SUBMITTED', actor: 'Billing System', description: `Claim submitted to ${payer.name}.`, amount_cents: totalBilled },
    { event_id: `TL-${claim_id}-2`, claim_id, occurred_at: isoDaysAgo(spec.agingDays - 1),
      kind: 'ACKNOWLEDGED', actor: payer.name, description: 'Claim acknowledged via 277CA.' },
  ];
  denial_events.forEach((d, i) => {
    timeline.push({
      event_id: `TL-${claim_id}-D${i}`, claim_id, occurred_at: d.occurred_at,
      kind: 'DENIED', actor: payer.name,
      description: `CARC ${d.carc_code}${d.rarc_code ? `/${d.rarc_code}` : ''} — ${d.root_cause}`,
      amount_cents: d.amount_cents,
    });
  });
  if (spec.state === 'partially_paid' || spec.state === 'paid') {
    timeline.push({
      event_id: `TL-${claim_id}-P`, claim_id,
      occurred_at: isoDaysAgo(Math.max(1, spec.agingDays - 10)),
      kind: spec.state === 'paid' ? 'PAID' : 'PARTIAL_PAY',
      actor: payer.name, description: `Payer remitted $${(actual / 100).toFixed(2)}.`,
      amount_cents: actual,
    });
  }

  // Appeals
  const appeals: Appeal[] = [];
  if (spec.hasAppeal && denial_events.length > 0) {
    const dispute = denial_events.reduce((s, d) => s + d.amount_cents, 0);
    const filedDays = Math.max(2, Math.floor(spec.agingDays / 2));
    appeals.push({
      appeal_id: `APL-${claim_id.slice(-5)}`,
      claim_id,
      denial_id: denial_events[0].denial_id,
      status: spec.appealStatus ?? 'submitted',
      level: 1,
      filed_at: spec.appealStatus === 'draft' ? undefined : isoDaysAgo(filedDays),
      decision_at: spec.appealStatus === 'approved' || spec.appealStatus === 'denied'
        ? isoDaysAgo(Math.max(1, filedDays - 14)) : undefined,
      amount_in_dispute_cents: dispute,
      amount_recovered_cents: spec.appealStatus === 'approved' ? dispute : undefined,
      evidence_attached: denial_events[0].evidence_required.slice(0, 2),
      rationale: `Appeal of denial CARC ${denial_events[0].carc_code}: ${denial_events[0].recommended_action}`,
      appeal_readiness_score: spec.appealStatus === 'draft' ? 55 : 88,
    });
    timeline.push({
      event_id: `TL-${claim_id}-A`, claim_id, occurred_at: isoDaysAgo(filedDays),
      kind: 'APPEAL_FILED', actor: 'Appeals Team',
      description: `Level 1 appeal filed for $${(dispute / 100).toFixed(2)}.`,
      amount_cents: dispute,
    });
    if (spec.appealStatus === 'approved' || spec.appealStatus === 'denied') {
      timeline.push({
        event_id: `TL-${claim_id}-AD`, claim_id, occurred_at: isoDaysAgo(Math.max(1, filedDays - 14)),
        kind: 'APPEAL_DECISION', actor: payer.name,
        description: `Appeal ${spec.appealStatus}.`,
      });
    }
  }

  // Workflow owner: first denial owner, otherwise biller
  const workflow_owner: WorkflowOwner = denial_events[0]?.workflow_owner
    ?? (spec.state === 'pending_payer' ? 'biller' : 'unassigned');

  const amount_at_risk_cents = spec.state === 'paid'
    ? 0
    : Math.max(totalDeniedCents, expected - actual);

  // Top recoverability across denials
  const recoverability_score = denial_events.length > 0
    ? Math.round(denial_events.reduce((s, d) => s + d.recoverability_score, 0) / denial_events.length)
    : spec.state === 'paid' ? 100 : 60;

  const severity = spec.state === 'paid' ? 'low'
    : computeSeverity(amount_at_risk_cents, recoverability_score);

  const intelDraft = {
    reimbursement_state: spec.state,
    amount_at_risk_cents,
    evidence_missing: spec.missingDocs ?? [],
    appeals,
    aging_days: spec.agingDays,
    is_escalated: !!spec.escalated,
    is_stalled: !!spec.stalled,
    denial_events,
  };

  const intel: ClaimIntel = {
    payer_id: payer.id,
    payer_name: payer.name,
    payer_class: payer.cls,
    submitted_at: submittedAt,
    aging_days: spec.agingDays,
    aging_bucket: agingBucket(spec.agingDays),
    reimbursement_state: spec.state,
    expected_reimbursement_cents: expected,
    actual_reimbursement_cents: actual,
    underpayment_cents: underpayment,
    amount_at_risk_cents,
    recoverability_score,
    severity,
    workflow_owner,
    sla_due_at: computeSlaDueAt(submittedAt, severity),
    is_escalated: !!spec.escalated,
    is_stalled: !!spec.stalled,
    is_high_value: amount_at_risk_cents >= 250000,
    denial_events,
    payer_responses,
    timeline: timeline.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    appeals,
    evidence_missing: spec.missingDocs ?? [],
    notes: [],
    queues: deriveQueues(intelDraft),
  };

  const status =
    spec.state === 'paid' ? 'PAID'
    : spec.state === 'denied' ? 'DENIED'
    : spec.state === 'partially_paid' ? 'ADJUSTED'
    : spec.state === 'appealing' ? 'PENDED'
    : spec.state === 'pending_payer' ? 'IN_ADJUDICATION'
    : 'RECEIVED';

  return {
    claim_id,
    member_id,
    provider_npi: provider.npi,
    provider_name: provider.name,
    facility_name: provider.facility,
    claim_type: 'professional',
    received_date: submittedAt.slice(0, 10),
    service_date_from: lines[0].service_date,
    service_date_to: lines[lines.length - 1].service_date,
    total_billed: totalBilled,
    lines,
    ohi_indicators: [],
    status,
    intel,
  };
}

export const clarityClaims: Claim[] = SCENARIOS.map((s, i) => generateClaim(i, s));

export const clarityAccumulators: Record<string, MemberAccumulators> =
  Object.fromEntries(
    PROVIDER_MEMBERS.map(m => [m, {
      member_id: m,
      plan_year: 2024,
      individual_deductible_used: between(0, 100000),
      individual_deductible_max: 100000,
      family_deductible_used: 0,
      family_deductible_max: 300000,
      individual_oop_used: between(0, 200000),
      individual_oop_max: 500000,
      family_oop_used: 0,
      family_oop_max: 1000000,
      benefit_limits: [],
    } satisfies MemberAccumulators]),
  );
