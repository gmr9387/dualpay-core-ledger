/**
 * Recommendation Trust Metrics
 *
 * All metrics derive directly from observable claim activity — no
 * fabricated benchmarks. Where insufficient history exists, the metric
 * returns null and the UI renders "Insufficient Evidence".
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { scoreEvidenceReadiness } from './evidence-readiness';

type C = Claim & { intel: ClaimIntel };

export interface TrustMetric {
  key: string;
  label: string;
  value: number | null;       // null → insufficient data
  unit: '%' | 'count' | 'cents' | 'days';
  numerator: number;
  denominator: number;
  basis: string;              // human-readable derivation
  sources: string[];          // referenced data points
}

export interface TrustReport {
  generated_at: string;
  metrics: TrustMetric[];
}

const MIN_SAMPLE = 5;

export function buildTrustReport(claims: C[]): TrustReport {
  const allAppeals = claims.flatMap(c => c.intel.appeals);
  const decidedAppeals = allAppeals.filter(a => a.status === 'approved' || a.status === 'denied' || a.status === 'partial');
  const wonAppeals = allAppeals.filter(a => a.status === 'approved' || a.status === 'partial');

  // 1. Appeal success rate
  const appealRate: TrustMetric = {
    key: 'appeal_success_rate',
    label: 'Appeal success rate',
    unit: '%',
    numerator: wonAppeals.length,
    denominator: decidedAppeals.length,
    value: decidedAppeals.length >= MIN_SAMPLE ? Math.round((wonAppeals.length / decidedAppeals.length) * 100) : null,
    basis: `Won (approved + partial) / decided (approved + partial + denied) across the active dataset.`,
    sources: ['claim.intel.appeals.status'],
  };

  // 2. Recommendation acceptance — claims where the recommended action was acted on
  // Proxy: claims with reimbursement_state ∈ {appealing, paid, resolved, written_off} are "actioned"
  const actionable = claims.filter(c => c.intel.denial_events.length > 0);
  const actioned = actionable.filter(c =>
    ['appealing', 'paid', 'resolved', 'written_off'].includes(c.intel.reimbursement_state)
  );
  const acceptance: TrustMetric = {
    key: 'recommendation_acceptance',
    label: 'Recommendation acceptance',
    unit: '%',
    numerator: actioned.length,
    denominator: actionable.length,
    value: actionable.length >= MIN_SAMPLE ? Math.round((actioned.length / actionable.length) * 100) : null,
    basis: 'Share of claims with denials that have moved into an actioned state (appealing, paid, resolved, written off).',
    sources: ['claim.intel.reimbursement_state', 'claim.intel.denial_events'],
  };

  // 3. Recoverability outcome — % of recovered claims where recoverability tier was MEDIUM or higher
  const recovered = claims.filter(c => c.intel.reimbursement_state === 'paid' || c.intel.reimbursement_state === 'resolved');
  const recoveredWithSignal = recovered.filter(c => c.intel.recoverability_score >= 35);
  const recoverability: TrustMetric = {
    key: 'recoverability_outcome',
    label: 'Recoverability score → outcome',
    unit: '%',
    numerator: recoveredWithSignal.length,
    denominator: recovered.length,
    value: recovered.length >= MIN_SAMPLE ? Math.round((recoveredWithSignal.length / recovered.length) * 100) : null,
    basis: 'Of claims marked recovered, share whose recoverability score was MEDIUM or HIGH (≥35) at decision time.',
    sources: ['claim.intel.recoverability_score', 'claim.intel.reimbursement_state'],
  };

  // 4. Evidence readiness trend (current snapshot only — no historical series yet)
  const eligibleForEvidence = claims.filter(c => c.intel.denial_events.length > 0);
  const ready = eligibleForEvidence.filter(c => {
    const e = scoreEvidenceReadiness(c, claims);
    return e.tier === 'READY';
  });
  const evidence: TrustMetric = {
    key: 'evidence_readiness',
    label: 'Evidence readiness',
    unit: '%',
    numerator: ready.length,
    denominator: eligibleForEvidence.length,
    value: eligibleForEvidence.length >= MIN_SAMPLE ? Math.round((ready.length / eligibleForEvidence.length) * 100) : null,
    basis: 'Share of denied claims whose evidence packet currently scores as READY.',
    sources: ['evidence_readiness.tier'],
  };

  // 5. Forecast variance — projected vs. actual recovered.
  // We have no historical forecast snapshots → emit null + explicit insufficient basis.
  const variance: TrustMetric = {
    key: 'forecast_variance',
    label: 'Forecast variance',
    unit: '%',
    numerator: 0, denominator: 0, value: null,
    basis: 'No historical forecast snapshots persisted yet — variance becomes available after the first month of completed projections.',
    sources: [],
  };

  return {
    generated_at: new Date().toISOString(),
    metrics: [acceptance, appealRate, recoverability, evidence, variance],
  };
}
