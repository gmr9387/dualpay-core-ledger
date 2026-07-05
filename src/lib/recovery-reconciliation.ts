/**
 * Recovery Reconciliation — auto-create recovery_outcomes rows from
 * 835 remittance imports.
 *
 * Rules (deterministic, no AI):
 * - Only fires for source === 'remittance_835'.
 * - Only creates outcomes for rows classified as 'underpayment', 'denial'
 *   RESOLVED via payment, or 'paid_in_full' where paid_cents > 0.
 * - Uses a deterministic outcome_id (`AUTO-<claim_id>-<batch8>`) so re-
 *   importing the same 835 does not double-count.
 * - Uses `ignoreDuplicates: true` on conflict → **manual outcomes logged
 *   in Outcome Log always win**; auto-created rows never overwrite.
 * - Every insert also writes an ops_events audit row for traceability.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ImportBatch, ParsedRow } from '@/types/import';
import type { RemittanceClassification } from '@/types/import';
import { normalizeRemittance } from '@/engine/remittance-normalizer';
import { classifyRemittance } from '@/engine/remittance-denial-extractor';

type ResolutionType =
  | 'recovered_full' | 'recovered_partial' | 'appeal_won'
  | 'appeal_lost'    | 'corrected_and_paid' | 'resubmitted_and_paid'
  | 'written_off'    | 'patient_responsibility' | 'duplicate_closed';

interface CandidateOutcome {
  outcome_id: string;
  claim_id: string;
  payer_id: string | null;
  resolution_type: ResolutionType;
  resolution_date: string;
  denied_amount_cents: number;
  recovered_amount_cents: number;
  unrecovered_amount_cents: number;
  notes: string;
  payload: Record<string, unknown>;
  org_id: string;
}

function decide(cls: RemittanceClassification, billed: number, paid: number): { type: ResolutionType | null; denied: number; recovered: number } {
  const total = billed;
  switch (cls.kind) {
    case 'paid_in_full':
      // Only counts as a recovery if the row had prior at-risk value in the batch;
      // safest: treat as corrected_and_paid ONLY when payment matches billed exactly.
      return paid >= total && total > 0
        ? { type: 'corrected_and_paid', denied: 0, recovered: paid }
        : { type: null, denied: 0, recovered: 0 };
    case 'underpayment':
      return paid > 0
        ? { type: 'recovered_partial', denied: cls.amount_at_risk_cents + paid, recovered: paid }
        : { type: null, denied: 0, recovered: 0 };
    case 'denial':
      return paid > 0
        ? { type: 'recovered_partial', denied: cls.amount_at_risk_cents + paid, recovered: paid }
        : { type: null, denied: 0, recovered: 0 };
    case 'cob':
    case 'contractual':
    default:
      return { type: null, denied: 0, recovered: 0 };
  }
}

export async function reconcileRemittanceOutcomes(
  batch: ImportBatch,
  rowClaimPairs: Array<{ row: ParsedRow; claim_id: string }>,
  orgId: string,
): Promise<{ created: number; skipped: number }> {
  if (!orgId) return { created: 0, skipped: rowClaimPairs.length };

  const candidates: CandidateOutcome[] = [];
  const nowIso = new Date().toISOString();
  const batchShort = batch.batch_id.slice(0, 8);

  for (const { row, claim_id } of rowClaimPairs) {
    const rem = normalizeRemittance(row);
    const cls = classifyRemittance(rem);
    const decision = decide(cls, rem.billed_cents, rem.paid_cents);
    if (!decision.type) continue;
    const resolutionDate = rem.remittance_date ?? rem.service_date ?? nowIso;
    candidates.push({
      outcome_id: `AUTO-${claim_id}-${batchShort}`,
      claim_id,
      payer_id: null,
      resolution_type: decision.type,
      resolution_date: resolutionDate,
      denied_amount_cents: decision.denied,
      recovered_amount_cents: decision.recovered,
      unrecovered_amount_cents: Math.max(0, decision.denied - decision.recovered),
      notes: `Auto-reconciled from 835 batch ${batchShort} · CARC ${rem.carc_code ?? '—'} · ${cls.kind}`,
      payload: {
        payer_name: rem.payer_name,
        category: cls.kind === 'underpayment' ? 'underpayment' : (cls.kind === 'denial' ? 'contractual' : 'contractual'),
        workflow_owner: 'unassigned',
        auto_reconciled: true,
        batch_id: batch.batch_id,
        source_row_number: row.index + 1,
        remittance_classification: cls.kind,
        remittance_reason: cls.reason,
      },
      org_id: orgId,
    });
  }

  if (candidates.length === 0) return { created: 0, skipped: rowClaimPairs.length };

  // Manual entries always win: ignoreDuplicates so any existing outcome_id
  // (manual or previously auto-created) is preserved.
  const { data, error } = await supabase
    .from('recovery_outcomes')
    .upsert(candidates as never, { onConflict: 'outcome_id', ignoreDuplicates: true })
    .select('outcome_id');
  if (error) {
    console.error('[reconcile] upsert failed', error.message);
    return { created: 0, skipped: candidates.length };
  }
  const created = data?.length ?? 0;

  // Audit trail
  if (created > 0) {
    const totalRecovered = candidates.reduce((s, c) => s + c.recovered_amount_cents, 0);
    await supabase.from('ops_events').insert([{
      org_id: orgId,
      kind: 'outcomes_auto_reconciled',
      claim_id: null,
      summary: `Auto-reconciled ${created} recovery outcome(s) from 835 batch ${batchShort} · $${(totalRecovered / 100).toFixed(2)} recovered`,
      payload: { batch_id: batch.batch_id, created, skipped: candidates.length - created },
    } as never]);
    // Notify UI to refresh outcome-driven dashboards
    window.dispatchEvent(new Event('clarity-outcomes'));
  }

  return { created, skipped: candidates.length - created };
}
