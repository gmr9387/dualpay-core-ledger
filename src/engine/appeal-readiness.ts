/**
 * Appeal Readiness Engine
 *
 * Combines evidence completeness, payer requirement coverage, deadline
 * status, and supporting-evidence presence into a single Appeal Readiness
 * verdict.  Every contributing factor is exposed so the user never has
 * to trust an opaque verdict.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { findRequirementsFor } from './payer-requirements';
import { scoreEvidenceReadiness, ReadinessTier } from './evidence-readiness';

export interface AppealReadinessFactor {
  label: string;
  detail: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  weight: number; // contribution to score (sum to 100)
  earned: number; // points earned
}

export interface AppealReadiness {
  tier: ReadinessTier;
  score: number; // 0-100
  factors: AppealReadinessFactor[];
  blockers: string[];
  next_steps: string[];
  deadline_status: 'open' | 'narrowing' | 'expiring' | 'expired' | 'unknown';
}

type C = Claim & { intel: ClaimIntel };

export function scoreAppealReadiness(claim: C, allClaims: C[]): AppealReadiness {
  const intel = claim.intel;
  const primary = intel.denial_events[0];
  const req = findRequirementsFor(intel.payer_id, allClaims);
  const evidence = scoreEvidenceReadiness(claim, allClaims);

  const factors: AppealReadinessFactor[] = [];
  const blockers: string[] = [];

  // F1 — Documentation completeness (40 pts)
  const docEarned = Math.round((evidence.score / 100) * 40);
  factors.push({
    label: 'Documentation completeness',
    detail: `${evidence.items_present}/${evidence.items_required} required items on file (${evidence.score}%).`,
    status: evidence.tier === 'READY' ? 'pass' : evidence.tier === 'NEEDS_REVIEW' ? 'warn' : evidence.tier === 'NOT_READY' ? 'fail' : 'unknown',
    weight: 40, earned: docEarned,
  });
  if (evidence.blocking_items.length) blockers.push(`Missing blocking docs: ${evidence.blocking_items.join(', ')}`);

  // F2 — Payer requirement coverage (20 pts)
  let payerEarned = 0;
  let payerStatus: AppealReadinessFactor['status'] = 'unknown';
  let payerDetail = 'No payer profile available — coverage cannot be assessed.';
  if (req) {
    const expected = req.documentation_expectations.length;
    const covered = expected - evidence.items_missing.filter(i => i.source === 'payer_expectation').length;
    const coverage = expected > 0 ? covered / expected : 1;
    payerEarned = Math.round(coverage * 20);
    payerStatus = coverage >= 0.9 ? 'pass' : coverage >= 0.6 ? 'warn' : 'fail';
    payerDetail = `${covered}/${expected} ${req.payer_name} expectations met.`;
  }
  factors.push({ label: 'Payer requirement coverage', detail: payerDetail, status: payerStatus, weight: 20, earned: payerEarned });

  // F3 — Deadline status (20 pts)
  let deadline_status: AppealReadiness['deadline_status'] = 'unknown';
  let deadlineEarned = 0;
  let deadlineStatus: AppealReadinessFactor['status'] = 'unknown';
  let deadlineDetail = 'Appeal window unknown — payer profile missing.';
  if (req && primary) {
    const windowDays = req.appeal_deadlines.level_1_days;
    const remaining = windowDays - intel.aging_days;
    if (remaining <= 0)              { deadline_status = 'expired';   deadlineEarned = 0;  deadlineStatus = 'fail'; deadlineDetail = `Level 1 window of ${windowDays}d expired ${Math.abs(remaining)}d ago.`; blockers.push('Appeal deadline expired.'); }
    else if (remaining <= 14)        { deadline_status = 'expiring';  deadlineEarned = 8;  deadlineStatus = 'warn'; deadlineDetail = `Only ${remaining}d remain in the ${windowDays}d Level 1 window.`; }
    else if (remaining <= 45)        { deadline_status = 'narrowing'; deadlineEarned = 14; deadlineStatus = 'warn'; deadlineDetail = `${remaining}d remain in the Level 1 window — schedule submission.`; }
    else                              { deadline_status = 'open';      deadlineEarned = 20; deadlineStatus = 'pass'; deadlineDetail = `${remaining}d remain in the ${windowDays}d Level 1 window.`; }
  }
  factors.push({ label: 'Appeal deadline', detail: deadlineDetail, status: deadlineStatus, weight: 20, earned: deadlineEarned });

  // F4 — Supporting evidence — prior payer behavior + appeal-eligibility (20 pts)
  let supportEarned = 0;
  let supportStatus: AppealReadinessFactor['status'] = 'unknown';
  let supportDetail = 'Denial appeal-eligibility unknown.';
  if (primary) {
    const eligible = primary.appeal_eligible;
    const priorWin = intel.appeals.some(a => a.status === 'approved' || a.status === 'partial');
    const priorLoss = intel.appeals.filter(a => a.status === 'denied').length;
    if (!eligible)       { supportEarned = 0;   supportStatus = 'fail'; supportDetail = 'Denial is not appeal-eligible per CARC.'; blockers.push('Denial not appeal-eligible.'); }
    else if (priorLoss >= 2) { supportEarned = 6; supportStatus = 'warn'; supportDetail = `${priorLoss} prior appeals denied at this level — escalation path indicated.`; }
    else if (priorWin)    { supportEarned = 20; supportStatus = 'pass'; supportDetail = 'Eligible + favorable payer precedent on file.'; }
    else                  { supportEarned = 14; supportStatus = 'pass'; supportDetail = 'Eligible — no prior appeal history blocking submission.'; }
  }
  factors.push({ label: 'Supporting evidence basis', detail: supportDetail, status: supportStatus, weight: 20, earned: supportEarned });

  const score = factors.reduce((s, f) => s + f.earned, 0);

  // Tier
  let tier: ReadinessTier;
  if (!primary || factors.every(f => f.status === 'unknown')) tier = 'INSUFFICIENT';
  else if (blockers.length === 0 && score >= 85) tier = 'READY';
  else if (blockers.length === 0 && score >= 60) tier = 'NEEDS_REVIEW';
  else tier = 'NOT_READY';

  const next_steps: string[] = [];
  if (tier === 'READY')        next_steps.push('Open Appeal Packet builder and submit.');
  if (tier === 'NEEDS_REVIEW') next_steps.push('Review failing factors before submission.');
  if (tier === 'NOT_READY')    next_steps.push('Close blockers before drafting appeal.');
  if (evidence.blocking_items.length) next_steps.push(`Retrieve: ${evidence.blocking_items.slice(0,2).join(', ')}.`);
  if (deadline_status === 'expiring' || deadline_status === 'narrowing') next_steps.push('Prioritise — appeal window is closing.');

  return { tier, score, factors, blockers, next_steps, deadline_status };
}
