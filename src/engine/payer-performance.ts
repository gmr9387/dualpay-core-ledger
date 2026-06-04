/**
 * Payer Performance Engine — Phase 11
 *
 * Composes live claim data (denial-intelligence already scored) with
 * persisted outcome history (recovery analytics) to produce payer
 * scorecards.  Reuses existing engines — no duplicate scoring.
 */
import type { ClarityClaim } from '@/hooks/use-clarity-data';
import type { RecoveryOutcome } from '@/types/outcomes';
import { RECOVERED_RESOLUTIONS } from '@/types/outcomes';
import type { DenialCategory } from '@/types/clarity';
import { CATEGORY_LABEL } from '@/engine/outcome-analytics';

export const MIN_SAMPLE = 5;

export interface PayerScorecard {
  payer_id: string;
  payer_name: string;
  total_claims: number;
  total_billed_cents: number;
  total_collected_cents: number;
  total_at_risk_cents: number;
  denial_rate: number;
  underpayment_rate: number;
  recovery_rate: number;
  avg_recovery_days: number;
  appeal_success_rate: number;
  top_denial_categories: Array<{ category: DenialCategory; label: string; count: number }>;
  top_failure_categories: Array<{ category: DenialCategory; label: string; unrecovered_cents: number }>;
  outcome_count: number;
  insufficient: boolean;
}

export function buildPayerScorecards(
  claims: ClarityClaim[], outcomes: RecoveryOutcome[],
): PayerScorecard[] {
  const byPayer = new Map<string, ClarityClaim[]>();
  for (const c of claims) {
    const k = c.intel.payer_id;
    if (!byPayer.has(k)) byPayer.set(k, []);
    byPayer.get(k)!.push(c);
  }
  const outByPayer = new Map<string, RecoveryOutcome[]>();
  for (const o of outcomes) {
    if (!outByPayer.has(o.payer_id)) outByPayer.set(o.payer_id, []);
    outByPayer.get(o.payer_id)!.push(o);
  }

  const cards: PayerScorecard[] = [];
  for (const [payer_id, list] of byPayer) {
    const name = list[0].intel.payer_name;
    const billed = list.reduce((s, c) => s + c.total_billed, 0);
    const collected = list.reduce((s, c) => s + c.intel.actual_reimbursement_cents, 0);
    const atRisk = list.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const denials = list.flatMap(c => c.intel.denial_events);
    const denial_rate = list.length ? list.filter(c => c.intel.denial_events.length > 0).length / list.length : 0;
    const underpaid = list.filter(c => c.intel.underpayment_cents > 0).length;
    const underpayment_rate = list.length ? underpaid / list.length : 0;

    const outcomes = outByPayer.get(payer_id) ?? [];
    const denied = outcomes.reduce((s, o) => s + o.denied_amount_cents, 0);
    const recovered = outcomes.reduce((s, o) => s + o.recovered_amount_cents, 0);
    const recovery_rate = denied ? recovered / denied : 0;
    const avg_days = outcomes.length ? outcomes.reduce((s, o) => s + o.days_to_resolution, 0) / outcomes.length : 0;
    const appeals = outcomes.filter(o => o.resolution_type === 'appeal_won' || o.resolution_type === 'appeal_lost');
    const wins = appeals.filter(o => o.resolution_type === 'appeal_won');
    const appeal_success_rate = appeals.length ? wins.length / appeals.length : 0;

    const catCount = new Map<DenialCategory, number>();
    for (const d of denials) catCount.set(d.category, (catCount.get(d.category) ?? 0) + 1);
    const top_denial_categories = [...catCount.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([category, count]) => ({ category, label: CATEGORY_LABEL[category] ?? category, count }));

    const failCents = new Map<DenialCategory, number>();
    for (const o of outcomes) {
      if (RECOVERED_RESOLUTIONS.includes(o.resolution_type)) continue;
      failCents.set(o.category, (failCents.get(o.category) ?? 0) + o.unrecovered_amount_cents);
    }
    const top_failure_categories = [...failCents.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([category, unrecovered_cents]) => ({ category, label: CATEGORY_LABEL[category] ?? category, unrecovered_cents }));

    cards.push({
      payer_id, payer_name: name,
      total_claims: list.length,
      total_billed_cents: billed,
      total_collected_cents: collected,
      total_at_risk_cents: atRisk,
      denial_rate, underpayment_rate,
      recovery_rate, avg_recovery_days: avg_days,
      appeal_success_rate,
      top_denial_categories, top_failure_categories,
      outcome_count: outcomes.length,
      insufficient: outcomes.length < MIN_SAMPLE,
    });
  }
  return cards.sort((a, b) => b.total_at_risk_cents - a.total_at_risk_cents);
}
