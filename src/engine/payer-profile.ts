/**
 * Payer Intelligence — derives operational profiles per payer
 * from observed claim activity.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel, DenialCategory } from '@/types/clarity';

export type DifficultyTier = 'EASY' | 'MODERATE' | 'DIFFICULT' | 'PUNITIVE';

export interface PayerProfileSummary {
  payer_id: string;
  payer_name: string;
  payer_class: ClaimIntel['payer_class'];
  total_claims: number;
  denial_rate: number;          // 0-1
  appeal_count: number;
  appeal_success_rate: number;  // 0-1
  avg_turnaround_days: number;
  total_billed_cents: number;
  total_paid_cents: number;
  total_at_risk_cents: number;
  collection_rate: number;      // paid / billed
  top_denial_reasons: Array<{ category: DenialCategory; count: number; sampleMessage?: string }>;
  documentation_requirements: string[];
  difficulty_tier: DifficultyTier;
  difficulty_drivers: string[];
}

type C = Claim & { intel: ClaimIntel };

function tierFromScore(score: number): DifficultyTier {
  if (score >= 75) return 'PUNITIVE';
  if (score >= 50) return 'DIFFICULT';
  if (score >= 25) return 'MODERATE';
  return 'EASY';
}

export function buildPayerProfiles(claims: C[]): PayerProfileSummary[] {
  const groups = new Map<string, C[]>();
  for (const c of claims) {
    const arr = groups.get(c.intel.payer_id) ?? [];
    arr.push(c);
    groups.set(c.intel.payer_id, arr);
  }

  return [...groups.entries()].map(([id, list]) => {
    const sample = list[0].intel;
    const billed = list.reduce((s, c) => s + c.total_billed, 0);
    const paid = list.reduce((s, c) => s + c.intel.actual_reimbursement_cents, 0);
    const atRisk = list.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const deniedClaims = list.filter(c => c.intel.denial_events.length > 0);
    const denial_rate = deniedClaims.length / list.length;

    const appeals = list.flatMap(c => c.intel.appeals);
    const decided = appeals.filter(a => a.status === 'approved' || a.status === 'denied' || a.status === 'partial');
    const wins = appeals.filter(a => a.status === 'approved' || a.status === 'partial');
    const appeal_success_rate = decided.length ? wins.length / decided.length : 0;

    const avg_turnaround_days = Math.round(
      list.reduce((s, c) => s + c.intel.aging_days, 0) / list.length
    );

    // Top denial reasons
    const reasonCount = new Map<DenialCategory, { count: number; msg?: string }>();
    for (const c of list) for (const d of c.intel.denial_events) {
      const cur = reasonCount.get(d.category) ?? { count: 0, msg: d.payer_message };
      cur.count += 1;
      reasonCount.set(d.category, cur);
    }
    const top_denial_reasons = [...reasonCount.entries()]
      .map(([category, v]) => ({ category, count: v.count, sampleMessage: v.msg }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Documentation requirements (union of evidence_required across denials)
    const docs = new Set<string>();
    for (const c of list) for (const d of c.intel.denial_events) d.evidence_required.forEach(e => docs.add(e));
    const documentation_requirements = [...docs].slice(0, 8);

    // Difficulty scoring
    const drivers: string[] = [];
    let score = 0;
    if (denial_rate >= 0.4) { score += 30; drivers.push(`High denial rate (${(denial_rate*100).toFixed(0)}%)`); }
    else if (denial_rate >= 0.2) { score += 15; drivers.push(`Elevated denial rate (${(denial_rate*100).toFixed(0)}%)`); }
    if (appeal_success_rate > 0 && appeal_success_rate < 0.4) { score += 20; drivers.push(`Low appeal overturn (${(appeal_success_rate*100).toFixed(0)}%)`); }
    if (avg_turnaround_days >= 45) { score += 20; drivers.push(`Slow turnaround (${avg_turnaround_days}d avg)`); }
    else if (avg_turnaround_days >= 28) { score += 10; drivers.push(`Moderate turnaround (${avg_turnaround_days}d avg)`); }
    if (atRisk >= 500_000) { score += 15; drivers.push('Heavy at-risk dollar concentration'); }
    if (sample.payer_class === 'medicaid') { score += 10; drivers.push('Medicaid program complexity'); }

    return {
      payer_id: id,
      payer_name: sample.payer_name,
      payer_class: sample.payer_class,
      total_claims: list.length,
      denial_rate,
      appeal_count: appeals.length,
      appeal_success_rate,
      avg_turnaround_days,
      total_billed_cents: billed,
      total_paid_cents: paid,
      total_at_risk_cents: atRisk,
      collection_rate: billed ? paid / billed : 0,
      top_denial_reasons,
      documentation_requirements,
      difficulty_tier: tierFromScore(score),
      difficulty_drivers: drivers.length ? drivers : ['Operationally clean payer'],
    };
  }).sort((a, b) => b.total_at_risk_cents - a.total_at_risk_cents);
}

export const DIFFICULTY_CLS: Record<DifficultyTier, string> = {
  EASY:      'bg-status-paid/10 text-status-paid border-status-paid/30',
  MODERATE:  'bg-status-pending/10 text-status-pending border-status-pending/30',
  DIFFICULT: 'bg-status-adjusted/15 text-status-adjusted border-status-adjusted/30',
  PUNITIVE:  'bg-status-denied/15 text-status-denied border-status-denied/30',
};
