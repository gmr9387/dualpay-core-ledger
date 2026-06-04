/**
 * Recovery Factory — Convert validated import rows into Claim records
 * with full ClaimIntel envelopes, reusing the existing intelligence
 * engines (denial scoring, severity, SLA, queue routing).
 *
 * No duplicate scoring logic. Pure transformation.
 */
import type { Claim, ClaimLine } from '@/types/claim';
import type {
  ClaimIntel,
  DenialEvent,
  GroupCode,
  ReimbursementState,
  WorkflowOwner,
} from '@/types/clarity';
import type { ParsedRow, ImportSourceType, CanonicalField } from '@/types/import';
import {
  scoreDenial,
  agingBucket,
  deriveQueues,
  computeSeverity,
  computeSlaDueAt,
} from './denial-intelligence';
import { normalizeRemittance } from './remittance-normalizer';
import { classifyRemittance, extractDenialEvent } from './remittance-denial-extractor';

const PAYER_CLASS_MAP: Array<[RegExp, ClaimIntel['payer_class']]> = [
  [/medicare/i,  'medicare'],
  [/medicaid/i,  'medicaid'],
  [/medi-?cal/i, 'medicaid'],
];

function classifyPayer(name: string): ClaimIntel['payer_class'] {
  for (const [re, cls] of PAYER_CLASS_MAP) if (re.test(name)) return cls;
  return 'commercial';
}

function getStr(row: ParsedRow, k: CanonicalField): string | undefined {
  const v = row.normalized[k];
  return v === undefined || v === '' ? undefined : String(v);
}
function getNum(row: ParsedRow, k: CanonicalField): number | undefined {
  const v = row.normalized[k];
  return typeof v === 'number' ? v : undefined;
}

function inferState(row: ParsedRow, source: ImportSourceType): ReimbursementState {
  const appeal = getStr(row, 'appeal_status')?.toLowerCase();
  if (appeal) {
    if (/appeal/.test(appeal) || /review/.test(appeal) || /submit/.test(appeal)) return 'appealing';
    if (/won|approved|paid/.test(appeal)) return 'paid';
    if (/lost|denied/.test(appeal)) return 'denied';
  }
  const paid = getNum(row, 'paid_amount') ?? 0;
  const billed = getNum(row, 'billed_amount') ?? 0;
  if (source === 'underpayment_report') return 'partially_paid';
  if (source === 'aging_report') return 'pending_payer';
  if (source === 'appeal_status') return 'appealing';
  if (source === 'remittance_835') {
    if (paid === 0) return 'denied';
    if (billed > 0 && paid < billed) return 'partially_paid';
    return 'paid';
  }
  if (paid > 0 && billed > 0 && paid < billed) return 'partially_paid';
  return 'denied';
}

export interface ConversionResult {
  claim: Claim;
  expectedRecoveryCents: number;
}

export function rowToClaim(row: ParsedRow, source: ImportSourceType, batchId: string): ConversionResult {
  const claimIdRaw = getStr(row, 'claim_id') ?? `IMP-${batchId.slice(0, 6)}-${row.index + 1}`;
  const claim_id = claimIdRaw.startsWith('CLM') ? claimIdRaw : `IMP-${claimIdRaw}`;
  const payer_name = getStr(row, 'payer_name') ?? 'Unknown Payer';
  const payer_id = payer_name.replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase() || 'UNK';
  const payer_class = classifyPayer(payer_name);

  const dosStr = getStr(row, 'service_date') ?? new Date().toISOString().slice(0, 10);
  const submittedDate = getStr(row, 'submitted_date') ?? dosStr;
  const aging = getNum(row, 'aging_days') ?? Math.max(0, Math.floor(
    (Date.now() - new Date(submittedDate).getTime()) / 86_400_000,
  ));
  const submittedAt = new Date(Date.now() - aging * 86_400_000).toISOString();

  const billed = getNum(row, 'billed_amount') ?? getNum(row, 'amount_at_risk') ?? 0;
  const paid = getNum(row, 'paid_amount') ?? 0;

  // ── Phase 10: remittance source uses deterministic classifier for at-risk ──
  let atRisk: number;
  let remittanceClassificationReason: string | undefined;
  if (source === 'remittance_835') {
    const rem = normalizeRemittance(row);
    const cls = classifyRemittance(rem);
    atRisk = cls.amount_at_risk_cents;
    remittanceClassificationReason = cls.reason;
  } else {
    atRisk = getNum(row, 'amount_at_risk') ?? Math.max(0, billed - paid);
  }

  const procedure_code = getStr(row, 'procedure_code') ?? '99213';

  const line: ClaimLine = {
    line_id: `L1-${claim_id}`,
    claim_id,
    service_date: dosStr,
    claim_line_number: 1,
    procedure_code,
    diagnosis_codes: [],
    billed_amount: Math.max(billed, atRisk, 1),
    units: 1,
    place_of_service: '11',
  };

  const denial_events: DenialEvent[] = [];
  const carc = getStr(row, 'carc_code');
  if (source === 'remittance_835' && atRisk > 0) {
    const rem = normalizeRemittance(row);
    const cls = classifyRemittance(rem);
    const evt = extractDenialEvent(rem, cls, claim_id, aging);
    if (evt) denial_events.push({ ...evt, line_id: line.line_id });
  } else if (carc && atRisk > 0) {
    const group = (getStr(row, 'group_code') as GroupCode | undefined) ?? 'CO';
    denial_events.push(scoreDenial({
      denial_id: `DNL-${claim_id}-1`,
      claim_id,
      line_id: line.line_id,
      occurred_at: submittedAt,
      carc,
      rarc: getStr(row, 'rarc_code'),
      group_code: group,
      amount_cents: atRisk,
      payer_message: getStr(row, 'denial_message'),
      aging_days: aging,
      prior_appeals_denied: 0,
    }));
  } else if (source === 'underpayment_report' && atRisk > 0) {
    denial_events.push(scoreDenial({
      denial_id: `DNL-${claim_id}-UP`,
      claim_id,
      line_id: line.line_id,
      occurred_at: submittedAt,
      carc: 'UNDERPAY',
      group_code: 'CO',
      amount_cents: atRisk,
      payer_message: getStr(row, 'denial_message') ?? 'Paid below contracted rate.',
      aging_days: aging,
    }));
  }

  const state = inferState(row, source);
  const recoverability_score = denial_events.length > 0
    ? Math.round(denial_events.reduce((s, d) => s + d.recoverability_score, 0) / denial_events.length)
    : 60;
  const severity = computeSeverity(atRisk, recoverability_score);
  const workflow_owner: WorkflowOwner = denial_events[0]?.workflow_owner ?? 'biller';

  const intelDraft = {
    reimbursement_state: state,
    amount_at_risk_cents: atRisk,
    evidence_missing: [],
    appeals: [],
    aging_days: aging,
    is_escalated: aging > 90,
    is_stalled: aging > 30 && state === 'pending_payer',
    denial_events,
  };

  const intel: ClaimIntel = {
    payer_id,
    payer_name,
    payer_class,
    submitted_at: submittedAt,
    aging_days: aging,
    aging_bucket: agingBucket(aging),
    reimbursement_state: state,
    expected_reimbursement_cents: billed,
    actual_reimbursement_cents: paid,
    underpayment_cents: Math.max(0, (getNum(row, 'allowed_amount') ?? billed) - paid),
    amount_at_risk_cents: atRisk,
    recoverability_score,
    severity,
    workflow_owner,
    sla_due_at: computeSlaDueAt(submittedAt, severity),
    is_escalated: intelDraft.is_escalated,
    is_stalled: intelDraft.is_stalled,
    is_high_value: atRisk >= 250000,
    denial_events,
    payer_responses: [],
    timeline: [
      { event_id: `TL-${claim_id}-1`, claim_id, occurred_at: submittedAt,
        kind: 'SUBMITTED', actor: `Import: ${source}`, description: `Claim ingested via Recovery Factory.`, amount_cents: billed },
    ],
    appeals: [],
    evidence_missing: [],
    notes: [`Imported from batch ${batchId.slice(0, 8)}`],
    queues: deriveQueues(intelDraft),
  };

  const claim: Claim = {
    claim_id,
    member_id: getStr(row, 'member_id') ?? 'MEM-IMPORT',
    provider_npi: getStr(row, 'provider_npi') ?? '0000000000',
    provider_name: getStr(row, 'provider_name') ?? 'Imported Provider',
    claim_type: 'professional',
    received_date: submittedAt.slice(0, 10),
    service_date_from: dosStr,
    service_date_to: dosStr,
    total_billed: line.billed_amount,
    lines: [line],
    ohi_indicators: [],
    status: state === 'paid' ? 'PAID' : state === 'denied' ? 'DENIED'
      : state === 'partially_paid' ? 'ADJUSTED' : state === 'appealing' ? 'PENDED' : 'IN_ADJUDICATION',
    intel,
  };

  const expectedRecoveryCents = Math.round(atRisk * (recoverability_score / 100));
  return { claim, expectedRecoveryCents };
}
