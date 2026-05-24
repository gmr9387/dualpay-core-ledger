/**
 * Sufficiency Guards
 *
 * Determine when there is enough data to render a deterministic
 * recommendation/score, vs. when the UI must show "Insufficient
 * Evidence" with the missing data elements enumerated.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';

export interface SufficiencyCheck {
  sufficient: boolean;
  missing_elements: string[];
  required_actions: string[];
}

export function checkClaimSufficiency(claim: Claim & { intel: ClaimIntel }): SufficiencyCheck {
  const missing: string[] = [];
  const actions: string[] = [];

  if (!claim.intel.denial_events.length && claim.intel.reimbursement_state !== 'paid' && claim.intel.reimbursement_state !== 'resolved') {
    missing.push('Denial events (CARC/RARC)');
    actions.push('Wait for payer response (ERA/EOB) before scoring.');
  }
  if (!claim.intel.payer_responses.length) {
    missing.push('Payer response (835 / EOB)');
    actions.push('Confirm clearinghouse acknowledged the original submission.');
  }
  if (!claim.intel.payer_id) {
    missing.push('Payer identification');
    actions.push('Re-run eligibility to capture payer ID.');
  }

  return { sufficient: missing.length === 0, missing_elements: missing, required_actions: actions };
}

export function checkForecastSufficiency(
  claims: Array<Claim & { intel: ClaimIntel }>,
): SufficiencyCheck {
  const missing: string[] = [];
  const actions: string[] = [];
  const active = claims.filter(c => c.intel.amount_at_risk_cents > 0);
  if (active.length < 5) {
    missing.push(`Active pipeline below minimum sample (have ${active.length}, need ≥5).`);
    actions.push('Continue ingesting claims; forecast becomes available once pipeline reaches the threshold.');
  }
  return { sufficient: missing.length === 0, missing_elements: missing, required_actions: actions };
}

export function checkPayerSufficiency(
  claims: Array<Claim & { intel: ClaimIntel }>,
  payerId: string,
): SufficiencyCheck {
  const missing: string[] = [];
  const actions: string[] = [];
  const list = claims.filter(c => c.intel.payer_id === payerId);
  if (list.length < 3) {
    missing.push(`Payer claim history below minimum (have ${list.length}, need ≥3).`);
    actions.push('Difficulty rating stays in "Insufficient Evidence" until at least 3 claims observed.');
  }
  const appeals = list.flatMap(c => c.intel.appeals);
  const decided = appeals.filter(a => a.status !== 'draft' && a.status !== 'in_review' && a.status !== 'submitted');
  if (decided.length < 2) {
    missing.push(`Decided appeal history below minimum (have ${decided.length}, need ≥2).`);
    actions.push('Overturn rate is suppressed until at least 2 decided appeals are observed.');
  }
  return { sufficient: missing.length === 0, missing_elements: missing, required_actions: actions };
}
