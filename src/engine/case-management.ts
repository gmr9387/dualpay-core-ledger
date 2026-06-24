/**
 * Case Management Engine
 * 
 * Links claims to cases, tracks cross-claim accumulator impact,
 * and handles retro-recalculation with diff generation.
 */

import type { AdjudicationRun, MemberAccumulators, ContractTerms, PlanBenefits, PriorPayerOutcome, Claim } from '@/types/claim';
import type {
  Case,
  CaseEvent,
  AdjudicationDiff,
  LineDiff,
  CaseAccumulatorImpact,
  ClaimAccumulatorContribution,
} from '@/types/case';
import type { TraceObject } from '@/types/trace';
import { adjudicateClaim, generateId } from './calculation-engine';
import { executeAdjudicationWithReplay } from './adjudication-orchestrator';

// ── Diff Generation ───────────────────────────────────────────

const DIFF_FIELDS = [
  'allowed', 'deductible_applied', 'coinsurance', 'copay', 'plan_paid', 'member_responsibility'
] as const;

export function generateAdjudicationDiff(
  claimId: string,
  beforeRun: AdjudicationRun,
  afterRun: AdjudicationRun
): AdjudicationDiff {
  const lineDiffs: LineDiff[] = [];

  for (const afterLine of afterRun.line_results) {
    const beforeLine = beforeRun.line_results.find(l => l.line_id === afterLine.line_id);
    if (!beforeLine) continue;

    for (const field of DIFF_FIELDS) {
      const before = beforeLine[field] as number;
      const after = afterLine[field] as number;
      if (before !== after) {
        lineDiffs.push({
          line_id: afterLine.line_id,
          field,
          before,
          after,
          delta: after - before,
        });
      }
    }
  }

  return {
    claim_id: claimId,
    before_run_id: beforeRun.run_id,
    after_run_id: afterRun.run_id,
    line_diffs: lineDiffs,
    total_plan_paid_delta: afterRun.total_plan_paid - beforeRun.total_plan_paid,
    total_member_resp_delta: afterRun.total_member_responsibility - beforeRun.total_member_responsibility,
  };
}

// ── Retro-Recalculation ───────────────────────────────────────

export interface RetroResult {
  claimId: string;
  originalRun: AdjudicationRun;
  newRun: AdjudicationRun;
  newTrace: TraceObject;
  diff: AdjudicationDiff;
}

/**
 * Retro-recalculate subsequent claims in a case when a claim is reversed/adjusted.
 * 
 * When a claim is reversed, its accumulator impact is removed, and all subsequent
 * claims (by service date) are re-adjudicated with the corrected accumulators.
 */
export function retroRecalculate(
  reversedClaimId: string,
  caseClaims: Claim[],
  originalRuns: Map<string, AdjudicationRun>,
  baseAccumulators: MemberAccumulators,
  contract: ContractTerms,
  plan: PlanBenefits,
  priorOutcomes: PriorPayerOutcome[]
): RetroResult[] {
  // Sort claims by service date
  const sorted = [...caseClaims].sort((a, b) =>
    a.service_date_from.localeCompare(b.service_date_from)
  );

  const reversedIdx = sorted.findIndex(c => c.claim_id === reversedClaimId);
  if (reversedIdx < 0) return [];

  // Claims after the reversed one need re-adjudication
  const claimsToRecalc = sorted.slice(reversedIdx + 1);
  const results: RetroResult[] = [];

  // Build adjusted accumulators: start from base, apply only claims before reversed
  let adjustedAcc = { ...baseAccumulators };
  for (let i = 0; i < reversedIdx; i++) {
    const run = originalRuns.get(sorted[i].claim_id);
    if (run) {
      adjustedAcc = applyRunToAccumulators(adjustedAcc, run);
    }
  }

  // Re-adjudicate each subsequent claim with corrected accumulators
  for (const claim of claimsToRecalc) {
    const originalRun = originalRuns.get(claim.claim_id);
    if (!originalRun) continue;

    const claimPriors = priorOutcomes.filter(po =>
      claim.lines.some(l => l.line_id === po.claim_line_id)
    );

    const { run: newRun, trace: newTrace } = adjudicateClaim(
      claim.lines, adjustedAcc, contract, plan, claimPriors,
      { runId: generateId('retro_run') }
    );

    const diff = generateAdjudicationDiff(claim.claim_id, originalRun, newRun);
    results.push({ claimId: claim.claim_id, originalRun, newRun, newTrace, diff });

    // Carry forward updated accumulators
    adjustedAcc = applyRunToAccumulators(adjustedAcc, newRun);
  }

  return results;
}

function applyRunToAccumulators(acc: MemberAccumulators, run: AdjudicationRun): MemberAccumulators {
  const totalDeductible = run.line_results.reduce((s, r) => s + r.deductible_applied, 0);
  const totalMemberResp = run.line_results.reduce((s, r) => s + r.member_responsibility, 0);
  return {
    ...acc,
    individual_deductible_used: acc.individual_deductible_used + totalDeductible,
    individual_oop_used: acc.individual_oop_used + totalMemberResp,
  };
}

// ── Case Accumulator Impact ───────────────────────────────────

export function calculateCaseAccumulatorImpact(
  caseData: Case,
  claims: Claim[],
  runs: Map<string, AdjudicationRun>
): CaseAccumulatorImpact {
  const contributions: ClaimAccumulatorContribution[] = [];

  for (const claimId of caseData.claim_ids) {
    const claim = claims.find(c => c.claim_id === claimId);
    const run = runs.get(claimId);
    if (!claim || !run) continue;

    contributions.push({
      claim_id: claimId,
      status: claim.status,
      deductible_applied: run.line_results.reduce((s, r) => s + r.deductible_applied, 0),
      coinsurance_applied: run.line_results.reduce((s, r) => s + r.coinsurance, 0),
      copay_applied: run.line_results.reduce((s, r) => s + r.copay, 0),
      plan_paid: run.total_plan_paid,
      member_responsibility: run.total_member_responsibility,
    });
  }

  return {
    case_id: caseData.case_id,
    member_id: caseData.member_id,
    claims: contributions,
    total_deductible_applied: contributions.reduce((s, c) => s + c.deductible_applied, 0),
    total_oop_applied: contributions.reduce((s, c) => s + c.member_responsibility, 0),
    total_plan_paid: contributions.reduce((s, c) => s + c.plan_paid, 0),
  };
}

// ── Case Event Builder ────────────────────────────────────────

export function createCaseEvent(
  caseId: string,
  eventType: CaseEvent['event_type'],
  description: string,
  claimId?: string,
  metadata?: Record<string, unknown>
): CaseEvent {
  return {
    event_id: generateId('evt'),
    case_id: caseId,
    timestamp: new Date().toISOString(),
    event_type: eventType,
    claim_id: claimId,
    description,
    metadata,
  };
}
