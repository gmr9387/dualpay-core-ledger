/**
 * Outcome Analytics Engine — Phase 5
 *
 * Deterministic recovery analytics derived from logged
 * RecoveryOutcome records.  No ML, no fabricated values; when a
 * group has fewer than MIN_SAMPLE outcomes the engine returns
 * `insufficient: true` so the UI can surface "Insufficient
 * Outcome History" instead of a noisy metric.
 */
import type { RecoveryOutcome } from '@/types/outcomes';
import { RECOVERED_RESOLUTIONS } from '@/types/outcomes';
import type { DenialCategory, WorkflowOwner } from '@/types/clarity';

export const MIN_SAMPLE = 5;

export interface GroupStat {
  key: string;
  label: string;
  count: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  recovery_rate: number;            // 0-1
  avg_days_to_resolution: number;
  appeal_success_rate: number;      // 0-1, among appeal_* outcomes
  avg_recovered_amount_cents: number;
  insufficient: boolean;            // true when count < MIN_SAMPLE
}

function aggregate(outcomes: RecoveryOutcome[], key: string, label: string): GroupStat {
  const denied = outcomes.reduce((s, o) => s + o.denied_amount_cents, 0);
  const recovered = outcomes.reduce((s, o) => s + o.recovered_amount_cents, 0);
  const days = outcomes.reduce((s, o) => s + o.days_to_resolution, 0);
  const appeals = outcomes.filter(o => o.resolution_type === 'appeal_won' || o.resolution_type === 'appeal_lost');
  const wins = appeals.filter(o => o.resolution_type === 'appeal_won');
  return {
    key, label,
    count: outcomes.length,
    total_denied_cents: denied,
    total_recovered_cents: recovered,
    recovery_rate: denied ? recovered / denied : 0,
    avg_days_to_resolution: outcomes.length ? days / outcomes.length : 0,
    appeal_success_rate: appeals.length ? wins.length / appeals.length : 0,
    avg_recovered_amount_cents: outcomes.length ? recovered / outcomes.length : 0,
    insufficient: outcomes.length < MIN_SAMPLE,
  };
}

function groupBy<T>(list: RecoveryOutcome[], keyFn: (o: RecoveryOutcome) => T, labelFn?: (k: T) => string): GroupStat[] {
  const m = new Map<string, RecoveryOutcome[]>();
  const labels = new Map<string, string>();
  for (const o of list) {
    const k = String(keyFn(o));
    if (!m.has(k)) { m.set(k, []); labels.set(k, labelFn ? labelFn(keyFn(o)) : k); }
    m.get(k)!.push(o);
  }
  return [...m.entries()].map(([k, arr]) => aggregate(arr, k, labels.get(k) ?? k));
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
  bundled: 'Bundled (NCCI)',
  coding: 'Coding',
  coverage: 'Coverage',
  underpayment: 'Underpayment',
};

const OWNER_LABEL: Record<WorkflowOwner, string> = {
  biller: 'Billing', coder: 'Coding', auth_team: 'Authorization', clinical: 'Clinical',
  appeals: 'Appeals', cob_team: 'COB', eligibility: 'Eligibility', unassigned: 'Unassigned',
};

export function recoveryByCategory(outcomes: RecoveryOutcome[]): GroupStat[] {
  return groupBy(outcomes, o => o.category, k => CATEGORY_LABEL[k as DenialCategory] ?? k as string)
    .sort((a, b) => b.total_recovered_cents - a.total_recovered_cents);
}
export function recoveryByPayer(outcomes: RecoveryOutcome[]): GroupStat[] {
  // Build with payer_name as label
  const m = new Map<string, RecoveryOutcome[]>();
  for (const o of outcomes) {
    const k = o.payer_id;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  return [...m.entries()]
    .map(([k, arr]) => aggregate(arr, k, arr[0].payer_name))
    .sort((a, b) => b.total_recovered_cents - a.total_recovered_cents);
}
export function recoveryByOwner(outcomes: RecoveryOutcome[]): GroupStat[] {
  return groupBy(outcomes, o => o.workflow_owner, k => OWNER_LABEL[k as WorkflowOwner] ?? k as string)
    .sort((a, b) => b.recovery_rate - a.recovery_rate);
}
export function recoveryByPlaybook(outcomes: RecoveryOutcome[]): GroupStat[] {
  return groupBy(outcomes, o => o.playbook_used ?? o.category, k => CATEGORY_LABEL[k as DenialCategory] ?? String(k))
    .sort((a, b) => b.recovery_rate - a.recovery_rate);
}

export interface PeriodStat extends GroupStat { period_start: string }

function periodKey(iso: string, mode: 'month' | 'quarter'): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  if (mode === 'month') return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export function recoveryByPeriod(outcomes: RecoveryOutcome[], mode: 'month' | 'quarter'): PeriodStat[] {
  const m = new Map<string, RecoveryOutcome[]>();
  for (const o of outcomes) {
    const k = periodKey(o.resolution_date, mode);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  return [...m.entries()]
    .map(([k, arr]) => ({ ...aggregate(arr, k, k), period_start: k }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ── Headline metrics ─────────────────────────────────────────

export interface HeadlineMetrics {
  total_denied_cents: number;
  total_recovered_cents: number;
  recovery_rate: number;
  appeal_success_rate: number;
  avg_days_to_resolution: number;
  outcome_count: number;
  insufficient: boolean;
}

export function headlineMetrics(outcomes: RecoveryOutcome[]): HeadlineMetrics {
  const denied = outcomes.reduce((s, o) => s + o.denied_amount_cents, 0);
  const recovered = outcomes.reduce((s, o) => s + o.recovered_amount_cents, 0);
  const days = outcomes.reduce((s, o) => s + o.days_to_resolution, 0);
  const appeals = outcomes.filter(o => o.resolution_type === 'appeal_won' || o.resolution_type === 'appeal_lost');
  const wins = appeals.filter(o => o.resolution_type === 'appeal_won');
  return {
    total_denied_cents: denied,
    total_recovered_cents: recovered,
    recovery_rate: denied ? recovered / denied : 0,
    appeal_success_rate: appeals.length ? wins.length / appeals.length : 0,
    avg_days_to_resolution: outcomes.length ? days / outcomes.length : 0,
    outcome_count: outcomes.length,
    insufficient: outcomes.length < MIN_SAMPLE,
  };
}

// ── Calibration: predicted score vs actual recovery ──────────

export interface ScoreBand {
  band: string;            // "0-20", "21-40", …
  min: number; max: number;
  count: number;
  actual_recovery_rate: number;   // recovered$/denied$
  expected_midpoint: number;      // (min+max)/2 / 100 — naive expectation
  calibration_delta: number;      // actual - expected (positive = under-promised)
  insufficient: boolean;
}

export interface CalibrationReport {
  bands: ScoreBand[];
  overall_prediction_accuracy: number;    // 1 - mean(|actual - expected|) across populated bands
  false_positive_rate: number;            // score >=70 but recovered_rate < 50%
  false_negative_rate: number;            // score <=30 but recovered_rate >= 50%
  insufficient: boolean;
}

const BANDS: Array<{ band: string; min: number; max: number }> = [
  { band: '0–20',   min: 0,  max: 20 },
  { band: '21–40',  min: 21, max: 40 },
  { band: '41–60',  min: 41, max: 60 },
  { band: '61–80',  min: 61, max: 80 },
  { band: '81–100', min: 81, max: 100 },
];

export function calibration(outcomes: RecoveryOutcome[]): CalibrationReport {
  const bands: ScoreBand[] = BANDS.map(b => {
    const arr = outcomes.filter(o => o.predicted_recoverability_score >= b.min && o.predicted_recoverability_score <= b.max);
    const denied = arr.reduce((s, o) => s + o.denied_amount_cents, 0);
    const recovered = arr.reduce((s, o) => s + o.recovered_amount_cents, 0);
    const actual = denied ? recovered / denied : 0;
    const expected = (b.min + b.max) / 2 / 100;
    return {
      ...b,
      count: arr.length,
      actual_recovery_rate: actual,
      expected_midpoint: expected,
      calibration_delta: actual - expected,
      insufficient: arr.length < MIN_SAMPLE,
    };
  });

  const populated = bands.filter(b => !b.insufficient);
  const accuracy = populated.length
    ? 1 - populated.reduce((s, b) => s + Math.abs(b.calibration_delta), 0) / populated.length
    : 0;

  const high = bands.filter(b => b.min >= 61 && !b.insufficient);
  const low  = bands.filter(b => b.max <= 30 && !b.insufficient);
  const fp = high.length
    ? high.filter(b => b.actual_recovery_rate < 0.5).reduce((s, b) => s + b.count, 0) /
      high.reduce((s, b) => s + b.count, 0)
    : 0;
  const fn = low.length
    ? low.filter(b => b.actual_recovery_rate >= 0.5).reduce((s, b) => s + b.count, 0) /
      low.reduce((s, b) => s + b.count, 0)
    : 0;

  return {
    bands,
    overall_prediction_accuracy: Math.max(0, Math.min(1, accuracy)),
    false_positive_rate: fp,
    false_negative_rate: fn,
    insufficient: outcomes.length < MIN_SAMPLE,
  };
}

// ── Rankings ─────────────────────────────────────────────────

export function topN(stats: GroupStat[], n = 5, by: 'recovery_rate' | 'total_recovered_cents' | 'avg_days_to_resolution' = 'recovery_rate', dir: 'desc' | 'asc' = 'desc'): GroupStat[] {
  const arr = [...stats].filter(s => !s.insufficient);
  arr.sort((a, b) => dir === 'desc' ? (b[by] as number) - (a[by] as number) : (a[by] as number) - (b[by] as number));
  return arr.slice(0, n);
}
