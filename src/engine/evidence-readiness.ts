/**
 * Evidence Readiness Engine
 *
 * Deterministic scoring of how complete the evidence package is for a
 * given claim, relative to:
 *   - the active denial's required evidence list
 *   - the payer's documentation expectations
 *   - generic appeal-packet baselines
 *
 * Every output is reproducible from claim state. No probabilistic scoring.
 * When the evidence picture is too thin to evaluate at all, callers should
 * use `hasSufficientEvidenceContext` and render an "Insufficient Evidence"
 * surface instead of a fabricated score.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { findRequirementsFor } from './payer-requirements';

export type ReadinessTier = 'READY' | 'NEEDS_REVIEW' | 'NOT_READY' | 'INSUFFICIENT';

export interface ReadinessItem {
  label: string;
  present: boolean;
  source: 'denial_required' | 'payer_expectation' | 'baseline';
  blocking: boolean;
}

export interface EvidenceReadiness {
  tier: ReadinessTier;
  score: number;            // 0-100, items_present / items_required
  items_required: number;
  items_present: number;
  items_missing: ReadinessItem[];
  items_satisfied: ReadinessItem[];
  blocking_items: string[];
  recommended_actions: string[];
  basis: string[];          // explainability — where each requirement came from
}

const BASELINE_PACKET = ['Itemised bill', 'Claim image', 'Original EOB / 835'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

function isPresent(item: string, missing: string[], evidenceOnFile: string[]): boolean {
  const n = norm(item);
  // explicitly flagged as missing
  if (missing.some(m => norm(m).includes(n) || n.includes(norm(m)))) return false;
  // explicitly on file (from prior appeals' attached evidence)
  if (evidenceOnFile.some(e => norm(e).includes(n) || n.includes(norm(e)))) return true;
  // not in the missing list → assume on file (operational default)
  return true;
}

export function scoreEvidenceReadiness(
  claim: Claim & { intel: ClaimIntel },
  allClaims: Array<Claim & { intel: ClaimIntel }>,
): EvidenceReadiness {
  const intel = claim.intel;
  const primary = intel.denial_events[0];
  const req = findRequirementsFor(intel.payer_id, allClaims);
  const evidenceOnFile = intel.appeals.flatMap(a => a.evidence_attached);

  const reqItems: ReadinessItem[] = [];
  const basis: string[] = [];

  // 1. Denial-specific required evidence
  if (primary?.evidence_required.length) {
    basis.push(`Denial ${primary.carc_code}${primary.rarc_code ? '/' + primary.rarc_code : ''} requires ${primary.evidence_required.length} item(s).`);
    for (const item of primary.evidence_required) {
      reqItems.push({
        label: item,
        present: isPresent(item, intel.evidence_missing, evidenceOnFile),
        source: 'denial_required',
        blocking: true,
      });
    }
  }

  // 2. Payer documentation expectations
  if (req?.documentation_expectations.length) {
    basis.push(`${req.payer_name} expects ${req.documentation_expectations.length} standard documentation item(s).`);
    for (const item of req.documentation_expectations) {
      if (reqItems.some(r => norm(r.label) === norm(item))) continue;
      reqItems.push({
        label: item,
        present: isPresent(item, intel.evidence_missing, evidenceOnFile),
        source: 'payer_expectation',
        blocking: false,
      });
    }
  }

  // 3. Baseline appeal packet
  basis.push('Baseline appeal packet (itemised bill, claim image, EOB) always required.');
  for (const item of BASELINE_PACKET) {
    if (reqItems.some(r => norm(r.label) === norm(item))) continue;
    reqItems.push({
      label: item,
      present: isPresent(item, intel.evidence_missing, evidenceOnFile),
      source: 'baseline',
      blocking: false,
    });
  }

  const items_satisfied = reqItems.filter(r => r.present);
  const items_missing = reqItems.filter(r => !r.present);
  const score = reqItems.length === 0 ? 0 : Math.round((items_satisfied.length / reqItems.length) * 100);

  const blocking_items = items_missing.filter(i => i.blocking).map(i => i.label);

  let tier: ReadinessTier;
  if (reqItems.length < 2) tier = 'INSUFFICIENT';
  else if (blocking_items.length === 0 && score >= 90) tier = 'READY';
  else if (blocking_items.length === 0 && score >= 70) tier = 'NEEDS_REVIEW';
  else tier = 'NOT_READY';

  const recommended_actions: string[] = [];
  if (blocking_items.length > 0) {
    recommended_actions.push(`Retrieve blocking documentation: ${blocking_items.slice(0, 3).join(', ')}.`);
  }
  const missingOptional = items_missing.filter(i => !i.blocking).slice(0, 2).map(i => i.label);
  if (missingOptional.length) {
    recommended_actions.push(`Strengthen packet by attaching: ${missingOptional.join(', ')}.`);
  }
  if (tier === 'READY') recommended_actions.push('Packet is appeal-ready — proceed to submission.');

  return {
    tier, score,
    items_required: reqItems.length,
    items_present: items_satisfied.length,
    items_missing, items_satisfied,
    blocking_items, recommended_actions, basis,
  };
}

export const READINESS_CLS: Record<ReadinessTier, string> = {
  READY:         'bg-status-paid/10 text-status-paid border-status-paid/30',
  NEEDS_REVIEW:  'bg-status-pending/10 text-status-pending border-status-pending/30',
  NOT_READY:     'bg-status-denied/10 text-status-denied border-status-denied/30',
  INSUFFICIENT:  'bg-muted text-muted-foreground border-border',
};

export const READINESS_LABEL: Record<ReadinessTier, string> = {
  READY: 'Ready', NEEDS_REVIEW: 'Needs Review', NOT_READY: 'Not Ready', INSUFFICIENT: 'Insufficient Evidence',
};
