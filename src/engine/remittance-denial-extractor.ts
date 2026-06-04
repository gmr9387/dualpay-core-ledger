/**
 * Phase 10 — Remittance Denial & Underpayment Extractor
 *
 * Deterministic classification of a canonical remittance line into:
 *   - denial            (CARC present + adjusted amount on CO/PI/OA)
 *   - underpayment      (allowed > paid + patient_resp, or paid below contracted rate)
 *   - cob               (group=OA or CARC indicates COB/MSP)
 *   - contractual       (CO with no recovery)
 *   - paid_in_full      (paid + ptResp >= billed)
 *
 * Reuses existing intelligence:
 *   - scoreDenial          → recoverability + severity + workflow owner
 *   - computeSeverity, computeSlaDueAt, deriveQueues, agingBucket
 *
 * No new scoring engine. No fabricated AI conclusions.
 */
import type { DenialEvent, GroupCode } from '@/types/clarity';
import type {
  CanonicalRemittance,
  RemittanceClassification,
} from '@/types/import';
import { scoreDenial } from './denial-intelligence';

/** CARC codes that indicate Coordination of Benefits / other-insurance situations. */
const COB_CARC = new Set(['22', '23', '24', '25', '26', '27']);

export function classifyRemittance(rem: CanonicalRemittance): RemittanceClassification {
  const billed = rem.billed_cents;
  const paid   = rem.paid_cents;
  const ptResp = rem.patient_resp_cents;
  const allowed = rem.allowed_cents;
  const adj    = rem.adjustment_cents;
  const carc   = rem.carc_code;
  const group  = rem.group_code;

  // COB / other insurance primary
  if (group === 'OA' || (carc && COB_CARC.has(carc))) {
    return {
      kind: 'cob',
      amount_at_risk_cents: Math.max(0, billed - paid - ptResp),
      reason: 'Other insurance / coordination of benefits — verify primacy and rebill.',
    };
  }

  // Explicit denial: CARC present + zero or near-zero payment vs billed
  if (carc && (paid + ptResp) < billed && adj > 0 && group !== 'CO') {
    return {
      kind: 'denial',
      amount_at_risk_cents: Math.max(0, billed - paid - ptResp),
      reason: `Denial reported by payer (CARC ${carc}).`,
    };
  }

  // Contractual adjustment — written off per contract, not recoverable.
  if (group === 'CO' && carc && (paid > 0 || allowed > 0) && allowed > 0 && paid >= allowed) {
    return {
      kind: 'contractual',
      amount_at_risk_cents: 0,
      reason: 'Contractual adjustment paid at allowed rate — not recoverable.',
    };
  }

  // Underpayment: allowed > paid + patient_resp  OR  paid < expected billed
  if (allowed > 0 && allowed > paid + ptResp + 100 /* > $1 variance */) {
    return {
      kind: 'underpayment',
      amount_at_risk_cents: allowed - paid - ptResp,
      reason: `Paid $${(paid / 100).toFixed(2)} below allowed $${(allowed / 100).toFixed(2)} — variance $${((allowed - paid - ptResp) / 100).toFixed(2)}.`,
    };
  }

  // Heuristic underpayment: no CARC, paid < billed materially
  if (!carc && billed > 0 && paid + ptResp + adj < billed - 100) {
    return {
      kind: 'underpayment',
      amount_at_risk_cents: billed - paid - ptResp - adj,
      reason: 'Payment below billed amount with no contractual adjustment.',
    };
  }

  // Pure denial fallback when CARC present + group=CO and paid=0
  if (carc && paid === 0 && adj > 0) {
    return {
      kind: 'denial',
      amount_at_risk_cents: adj,
      reason: `Full denial under CARC ${carc} (group ${group ?? 'CO'}).`,
    };
  }

  return {
    kind: 'paid_in_full',
    amount_at_risk_cents: 0,
    reason: 'Paid at expected rate — no recovery action required.',
  };
}

/** Build a DenialEvent for a recoverable remittance line, reusing scoreDenial. */
export function extractDenialEvent(
  rem: CanonicalRemittance,
  classification: RemittanceClassification,
  claimId: string,
  agingDays: number,
): DenialEvent | null {
  if (classification.amount_at_risk_cents <= 0) return null;
  if (classification.kind === 'paid_in_full' || classification.kind === 'contractual') return null;

  const carc = rem.carc_code
    ?? (classification.kind === 'underpayment' ? 'UNDERPAY'
      : classification.kind === 'cob' ? '22'
      : 'UNKNOWN');
  const group: GroupCode = rem.group_code ?? (classification.kind === 'cob' ? 'OA' : 'CO');

  return scoreDenial({
    denial_id: `DNL-${claimId}-RMT`,
    claim_id: claimId,
    occurred_at: rem.remittance_date
      ? new Date(rem.remittance_date).toISOString()
      : new Date().toISOString(),
    carc,
    rarc: rem.rarc_code,
    group_code: group,
    amount_cents: classification.amount_at_risk_cents,
    payer_message: rem.denial_reason ?? classification.reason,
    aging_days: agingDays,
  });
}
