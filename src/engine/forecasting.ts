/**
 * Recovery Forecasting
 *
 * Projects expected revenue recovery based on the current pipeline,
 * recoverability scores, and typical payer turnaround.  Every number
 * is decomposable into the underlying claims and assumptions.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { explainRecoverability } from './recoverability';

export interface ForecastBucket {
  label: string;          // e.g. "Week 1"
  weeks_out: number;
  expected_recovery_cents: number;
  claim_count: number;
  appeal_workload_minutes: number;
  drivers: string[];      // top contributing claims / patterns
}

export interface RecoveryForecast {
  total_at_risk_cents: number;
  total_expected_recovery_cents: number;
  expected_recovery_rate: number; // 0-1
  buckets: ForecastBucket[];
  monthly_projection_cents: number;
  workload_minutes_total: number;
  assumptions: string[];
}

type C = Claim & { intel: ClaimIntel };

/**
 * Heuristic: typical recovery week buckets based on payer class
 * and current reimbursement state.
 *  - already in appeal review → 2-4 weeks
 *  - corrected/resubmit → 3-5 weeks
 *  - documentation gathering → 4-8 weeks
 *  - aging past 90d → 6-12 weeks
 */
function projectWeeks(c: C): number {
  if (c.intel.appeals.some(a => a.status === 'in_review' || a.status === 'submitted')) return 3;
  if (c.intel.evidence_missing.length > 0) return 6;
  if (c.intel.aging_days > 90) return 8;
  if (c.intel.payer_class === 'medicaid') return 6;
  if (c.intel.payer_class === 'medicare') return 5;
  return 4;
}

function bucketFor(weeks: number): { label: string; weeks_out: number } {
  if (weeks <= 2)  return { label: 'Next 2 weeks',     weeks_out: 2 };
  if (weeks <= 4)  return { label: 'Weeks 3–4',        weeks_out: 4 };
  if (weeks <= 8)  return { label: 'Weeks 5–8',        weeks_out: 8 };
  if (weeks <= 12) return { label: 'Weeks 9–12',       weeks_out: 12 };
  return { label: 'Beyond 12 weeks', weeks_out: 13 };
}

export function buildForecast(claims: C[]): RecoveryForecast {
  const active = claims.filter(c => c.intel.amount_at_risk_cents > 0);

  const totalAtRisk = active.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
  let totalExpected = 0;
  let totalWorkload = 0;

  const groups = new Map<string, { weeks_out: number; cents: number; count: number; minutes: number; tops: Array<{ id: string; cents: number }> }>();

  for (const c of active) {
    const exp = explainRecoverability(c);
    const expected = Math.round(c.intel.amount_at_risk_cents * exp.score / 100);
    totalExpected += expected;
    const minutes = 25 + c.intel.denial_events.length * 15 + c.intel.evidence_missing.length * 10;
    totalWorkload += minutes;

    const wk = projectWeeks(c);
    const b = bucketFor(wk);
    const g = groups.get(b.label) ?? { weeks_out: b.weeks_out, cents: 0, count: 0, minutes: 0, tops: [] };
    g.cents += expected;
    g.count += 1;
    g.minutes += minutes;
    g.tops.push({ id: c.claim_id, cents: expected });
    groups.set(b.label, g);
  }

  const buckets: ForecastBucket[] = [...groups.entries()]
    .map(([label, g]) => ({
      label, weeks_out: g.weeks_out,
      expected_recovery_cents: g.cents,
      claim_count: g.count,
      appeal_workload_minutes: g.minutes,
      drivers: g.tops.sort((a, b) => b.cents - a.cents).slice(0, 3).map(t => `${t.id} ≈$${(t.cents/100).toLocaleString()}`),
    }))
    .sort((a, b) => a.weeks_out - b.weeks_out);

  // Monthly projection — first ~4 weeks of expected recovery
  const monthly = buckets.filter(b => b.weeks_out <= 4).reduce((s, b) => s + b.expected_recovery_cents, 0);

  return {
    total_at_risk_cents: totalAtRisk,
    total_expected_recovery_cents: totalExpected,
    expected_recovery_rate: totalAtRisk ? totalExpected / totalAtRisk : 0,
    buckets, monthly_projection_cents: monthly, workload_minutes_total: totalWorkload,
    assumptions: [
      'Each claim is dollar-weighted by its recoverability score.',
      'Timeline buckets use payer class + current state heuristics (appeal in review = ~3w, doc gathering = ~6w).',
      'Workload minutes = base 25m + 15m per denial event + 10m per missing evidence item.',
      'Monthly projection counts buckets resolving within the next 4 weeks.',
    ],
  };
}
