/**
 * Recovery Outcome store (localStorage).
 *
 * Phase 5 introduces outcome tracking without schema changes.
 * Outcomes are derived deterministically from terminal claim state
 * on first run, then user-edited via the Outcome Log page.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel, DenialCategory } from '@/types/clarity';
import type { RecoveryOutcome, ResolutionType } from '@/types/outcomes';
import { explainRecoverability } from '@/engine/recoverability';

const KEY = 'clarity:outcomes:v1';
const SEED_KEY = 'clarity:outcomes:seeded:v1';

type Store = Record<string, RecoveryOutcome>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Store; }
  catch { return {}; }
}
function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('clarity-outcomes'));
}

export function getAllOutcomes(): RecoveryOutcome[] {
  return Object.values(read()).sort((a, b) => b.resolution_date.localeCompare(a.resolution_date));
}

export function getOutcome(id: string): RecoveryOutcome | undefined {
  return read()[id];
}

export function upsertOutcome(o: RecoveryOutcome) {
  const s = read();
  s[o.outcome_id] = { ...o, updated_at: new Date().toISOString() };
  write(s);
}

export function deleteOutcome(id: string) {
  const s = read();
  delete s[id];
  write(s);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

/**
 * Derive an initial outcome history from the existing operational
 * dataset.  Honest derivation — uses terminal states (paid /
 * written_off / appeal decided) already present on claims.
 */
export function deriveOutcomesFromClaims(claims: Array<Claim & { intel: ClaimIntel }>): RecoveryOutcome[] {
  const out: RecoveryOutcome[] = [];
  const now = new Date().toISOString();

  for (const c of claims) {
    const intel = c.intel;
    const primary = intel.denial_events[0];
    if (!primary && intel.reimbursement_state !== 'written_off') continue;

    const denial_date = primary?.occurred_at ?? intel.submitted_at;
    const category: DenialCategory = primary?.category ?? 'contractual';
    const predicted = explainRecoverability(c).score;

    // Decided appeals → one outcome per decided appeal
    const decided = intel.appeals.filter(a => ['approved', 'denied', 'partial'].includes(a.status));
    for (const a of decided) {
      const recovered = a.amount_recovered_cents ?? 0;
      const resolution: ResolutionType =
        a.status === 'approved' ? 'appeal_won'
        : a.status === 'partial' ? 'recovered_partial'
        : 'appeal_lost';
      const resolution_date = a.decision_at ?? a.filed_at ?? now;
      out.push({
        outcome_id: `OUT-${a.appeal_id}`,
        claim_id: c.claim_id,
        denial_id: a.denial_id ?? primary?.denial_id,
        payer_id: intel.payer_id,
        payer_name: intel.payer_name,
        category,
        workflow_owner: intel.workflow_owner,
        playbook_used: category,
        resolution_type: resolution,
        denied_amount_cents: a.amount_in_dispute_cents,
        recovered_amount_cents: recovered,
        unrecovered_amount_cents: Math.max(0, a.amount_in_dispute_cents - recovered),
        denial_date,
        resolution_date,
        days_to_resolution: daysBetween(denial_date, resolution_date),
        predicted_recoverability_score: predicted,
        created_at: now,
        updated_at: now,
      });
    }

    // Terminal claim states without decided appeal
    if (decided.length === 0) {
      if (intel.reimbursement_state === 'paid' && primary) {
        // Denial that was corrected/resubmitted and paid
        const recovered = intel.actual_reimbursement_cents;
        const denied = primary.amount_cents;
        out.push({
          outcome_id: `OUT-${c.claim_id}-CORR`,
          claim_id: c.claim_id,
          denial_id: primary.denial_id,
          payer_id: intel.payer_id,
          payer_name: intel.payer_name,
          category,
          workflow_owner: intel.workflow_owner,
          playbook_used: category,
          resolution_type: 'corrected_and_paid',
          denied_amount_cents: denied,
          recovered_amount_cents: Math.min(recovered, denied),
          unrecovered_amount_cents: Math.max(0, denied - recovered),
          denial_date,
          resolution_date: intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now,
          days_to_resolution: daysBetween(denial_date, intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now),
          predicted_recoverability_score: predicted,
          created_at: now,
          updated_at: now,
        });
      } else if (intel.reimbursement_state === 'written_off') {
        const denied = primary?.amount_cents ?? intel.amount_at_risk_cents;
        out.push({
          outcome_id: `OUT-${c.claim_id}-WO`,
          claim_id: c.claim_id,
          denial_id: primary?.denial_id,
          payer_id: intel.payer_id,
          payer_name: intel.payer_name,
          category,
          workflow_owner: intel.workflow_owner,
          playbook_used: category,
          resolution_type: 'written_off',
          denied_amount_cents: denied,
          recovered_amount_cents: 0,
          unrecovered_amount_cents: denied,
          denial_date,
          resolution_date: intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now,
          days_to_resolution: daysBetween(denial_date, intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now),
          predicted_recoverability_score: predicted,
          created_at: now,
          updated_at: now,
        });
      } else if (intel.reimbursement_state === 'partially_paid' && primary) {
        const recovered = intel.actual_reimbursement_cents;
        const denied = primary.amount_cents;
        out.push({
          outcome_id: `OUT-${c.claim_id}-PART`,
          claim_id: c.claim_id,
          denial_id: primary.denial_id,
          payer_id: intel.payer_id,
          payer_name: intel.payer_name,
          category,
          workflow_owner: intel.workflow_owner,
          playbook_used: category,
          resolution_type: 'recovered_partial',
          denied_amount_cents: denied,
          recovered_amount_cents: Math.min(recovered, denied),
          unrecovered_amount_cents: Math.max(0, denied - recovered),
          denial_date,
          resolution_date: intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now,
          days_to_resolution: daysBetween(denial_date, intel.timeline[intel.timeline.length - 1]?.occurred_at ?? now),
          predicted_recoverability_score: predicted,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  return out;
}

export function seedOutcomesIfEmpty(claims: Array<Claim & { intel: ClaimIntel }>) {
  if (localStorage.getItem(SEED_KEY)) return;
  const existing = read();
  if (Object.keys(existing).length > 0) {
    localStorage.setItem(SEED_KEY, '1');
    return;
  }
  const derived = deriveOutcomesFromClaims(claims);
  const s: Store = {};
  for (const o of derived) s[o.outcome_id] = o;
  write(s);
  localStorage.setItem(SEED_KEY, '1');
}

export function resetOutcomes() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(SEED_KEY);
  window.dispatchEvent(new Event('clarity-outcomes'));
}
