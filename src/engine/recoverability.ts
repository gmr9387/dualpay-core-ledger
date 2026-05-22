/**
 * Recoverability Engine
 *
 * Produces an explainable recovery score for a claim by combining
 * denial taxonomy baselines with operational signals — aging, prior
 * appeals, missing documentation, claim value, and payer behavior.
 *
 * Every score returns a factor breakdown so the UI can render
 * "why" without treating the number as a black box.
 */
import type { ClaimIntel } from '@/types/clarity';
import type { Claim } from '@/types/claim';

export type RecoveryTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RecoveryFactor {
  label: string;
  detail: string;
  delta: number; // points contributed (positive = boosts recovery; negative = drags)
  weight: 'baseline' | 'adjust';
}

export interface RecoveryExplanation {
  score: number; // 0-100, post-adjustments
  tier: RecoveryTier;
  headline: string;
  factors: RecoveryFactor[];
  recommended_path: string;
}

const tierFor = (score: number): RecoveryTier =>
  score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

/**
 * Payer behavior modifier — penalises payers with historically poor
 * turnaround / high denial rates.  Pulled from the claim's payer
 * class as a rough proxy in the absence of a real payer profile DB.
 */
function payerBehaviorAdjust(intel: ClaimIntel): RecoveryFactor | null {
  if (intel.payer_class === 'medicaid') {
    return { label: 'Payer behavior', detail: 'Medicaid: longer turnaround, stricter doc rules', delta: -6, weight: 'adjust' };
  }
  if (intel.payer_class === 'medicare') {
    return { label: 'Payer behavior', detail: 'Medicare: predictable LCD/NCD-based adjudication', delta: +4, weight: 'adjust' };
  }
  return null;
}

export function explainRecoverability(claim: Claim & { intel: ClaimIntel }): RecoveryExplanation {
  const intel = claim.intel;
  const factors: RecoveryFactor[] = [];

  // Baseline from denial taxonomy (average across denials)
  const baseFromDenials = intel.denial_events.length > 0
    ? Math.round(
        intel.denial_events.reduce((s, d) => s + (d.recoverability_score), 0) /
          intel.denial_events.length
      )
    : intel.reimbursement_state === 'paid' ? 100 : 60;

  const primary = intel.denial_events[0];
  factors.push({
    label: 'Denial type',
    detail: primary
      ? `Baseline for ${primary.category.replace(/_/g, ' ')} (${primary.carc_code}${primary.rarc_code ? '/' + primary.rarc_code : ''})`
      : 'No active denial — clean adjudication',
    delta: baseFromDenials,
    weight: 'baseline',
  });

  // Aging
  if (intel.aging_days > 120) {
    factors.push({ label: 'Aging', detail: `${intel.aging_days}d — past timely filing for most payers`, delta: -25, weight: 'adjust' });
  } else if (intel.aging_days > 90) {
    factors.push({ label: 'Aging', detail: `${intel.aging_days}d — appeal window narrowing`, delta: -15, weight: 'adjust' });
  } else if (intel.aging_days > 60) {
    factors.push({ label: 'Aging', detail: `${intel.aging_days}d — escalation recommended`, delta: -8, weight: 'adjust' });
  } else if (intel.aging_days > 30) {
    factors.push({ label: 'Aging', detail: `${intel.aging_days}d — within standard recovery window`, delta: -3, weight: 'adjust' });
  } else {
    factors.push({ label: 'Aging', detail: `${intel.aging_days}d — fresh, full window available`, delta: +4, weight: 'adjust' });
  }

  // Prior appeal history
  const priorDenied = intel.appeals.filter(a => a.status === 'denied').length;
  if (priorDenied > 0) {
    factors.push({ label: 'Appeal history', detail: `${priorDenied} prior appeal(s) denied — uphill at next level`, delta: priorDenied * -12, weight: 'adjust' });
  } else if (intel.appeals.some(a => a.status === 'approved')) {
    factors.push({ label: 'Appeal history', detail: 'Prior appeal won — favorable payer precedent', delta: +6, weight: 'adjust' });
  }

  // Missing documentation
  if (intel.evidence_missing.length > 0) {
    factors.push({
      label: 'Documentation gap',
      detail: `${intel.evidence_missing.length} required item(s) missing: ${intel.evidence_missing.slice(0, 2).join(', ')}`,
      delta: -8 * Math.min(intel.evidence_missing.length, 3),
      weight: 'adjust',
    });
  } else if (primary?.appeal_eligible) {
    factors.push({ label: 'Documentation', detail: 'Required evidence already on file', delta: +5, weight: 'adjust' });
  }

  // Claim value — high value gets more operational attention, slight boost
  if (claim.total_billed >= 500_000) {
    factors.push({ label: 'Claim value', detail: 'High-value claim — escalation path available', delta: +5, weight: 'adjust' });
  } else if (claim.total_billed < 20_000) {
    factors.push({ label: 'Claim value', detail: 'Low dollar — ROI on appeal effort is marginal', delta: -4, weight: 'adjust' });
  }

  // Payer behavior
  const pb = payerBehaviorAdjust(intel);
  if (pb) factors.push(pb);

  // Sum and clamp
  const raw = factors.reduce((s, f) => s + f.delta, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier = tierFor(score);

  const headline =
    tier === 'HIGH' ? 'Strong recovery candidate — pursue actively.'
    : tier === 'MEDIUM' ? 'Recoverable with effort — prioritise documentation and timing.'
    : 'Low recovery probability — confirm write-off or pursue cheaply.';

  const recommended_path =
    tier === 'HIGH'
      ? primary?.appeal_eligible
        ? `File ${intel.appeals.length > 0 ? `Level ${Math.min(3, intel.appeals.length + 1)}` : 'Level 1'} appeal with attached evidence.`
        : 'Correct & resubmit per recommended action.'
      : tier === 'MEDIUM'
        ? 'Close documentation gaps, then appeal or resubmit.'
        : intel.aging_days > 120 ? 'Likely write-off — verify timely filing proof first.' : 'Cost-of-pursuit review before further effort.';

  return { score, tier, headline, factors, recommended_path };
}
