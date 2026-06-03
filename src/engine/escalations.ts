/**
 * Escalation Engine — deterministic triggers and 4-level ladder.
 *
 * No fabricated AI conclusions: every escalation is the result of
 * an observable condition on the claim's intel state and the
 * client-side assignment / SLA state.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import type { Assignment } from '@/lib/assignments';
import { evaluateSla } from './sla';

export type EscalationTriggerKind =
  | 'sla_breach'
  | 'missing_evidence_7d'
  | 'aging_120'
  | 'appeal_rejected'
  | 'high_value_unassigned'
  | 'payer_non_responsive_30d'
  | 'timely_filing_risk';

export type EscalationLevel = 1 | 2 | 3 | 4;

export const LEVEL_LABEL: Record<EscalationLevel, string> = {
  1: 'L1 · Assigned Owner',
  2: 'L2 · Supervisor',
  3: 'L3 · Department Manager',
  4: 'L4 · Executive Review',
};

export const TRIGGER_LABEL: Record<EscalationTriggerKind, string> = {
  sla_breach:               'SLA Breach',
  missing_evidence_7d:      'Missing Evidence > 7d',
  aging_120:                'Aging > 120 days',
  appeal_rejected:          'Appeal Rejected',
  high_value_unassigned:    'High-Value Unassigned',
  payer_non_responsive_30d: 'Payer Non-Responsive > 30d',
  timely_filing_risk:       'Timely Filing Risk',
};

const HIGH_VALUE_CENTS = 100_000_00;
const TIMELY_FILING_DAYS = 150;

export interface EscalationCandidate {
  claim_id: string;
  level: EscalationLevel;
  triggers: Array<{ kind: EscalationTriggerKind; detail: string }>;
  recommended_owner: string;
  at_risk_cents: number;
  age_days: number;
  severity: ClaimIntel['severity'];
  payer_name: string;
}

type C = Claim & { intel: ClaimIntel };

function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

export function detectEscalation(
  claim: C,
  assignment: Assignment | undefined,
  now: number = Date.now(),
): EscalationCandidate | null {
  if (claim.intel.reimbursement_state === 'paid' || claim.intel.reimbursement_state === 'resolved' || claim.intel.reimbursement_state === 'written_off') return null;

  const triggers: EscalationCandidate['triggers'] = [];
  const sla = evaluateSla(claim, now);

  if (sla.state === 'breached') {
    triggers.push({ kind: 'sla_breach', detail: `${sla.age_hours}h since last action (limit ${sla.breach_hours}h for ${sla.severity}).` });
  }
  if (claim.intel.evidence_missing.length > 0) {
    const lastNote = claim.intel.timeline.find(t => t.kind === 'INFO_REQUESTED' || t.kind === 'DENIED');
    const since = lastNote ? daysSince(lastNote.occurred_at, now) : daysSince(claim.intel.submitted_at, now);
    if (since >= 7) triggers.push({ kind: 'missing_evidence_7d', detail: `${claim.intel.evidence_missing.length} item(s) missing for ${since}d.` });
  }
  if (claim.intel.aging_days > 120) {
    triggers.push({ kind: 'aging_120', detail: `${claim.intel.aging_days}d aged.` });
  }
  if (claim.intel.appeals.some(a => a.status === 'denied')) {
    const denied = claim.intel.appeals.filter(a => a.status === 'denied').length;
    triggers.push({ kind: 'appeal_rejected', detail: `${denied} prior appeal(s) denied.` });
  }
  if (claim.intel.amount_at_risk_cents >= HIGH_VALUE_CENTS && !assignment?.assignee) {
    triggers.push({ kind: 'high_value_unassigned', detail: `$${(claim.intel.amount_at_risk_cents / 100).toLocaleString()} at risk, no owner.` });
  }
  const lastPayer = [...claim.intel.timeline].reverse().find(t =>
    t.kind === 'DENIED' || t.kind === 'PARTIAL_PAY' || t.kind === 'INFO_REQUESTED' || t.kind === 'ACKNOWLEDGED' || t.kind === 'PAID' || t.kind === 'APPEAL_DECISION'
  );
  if (lastPayer && daysSince(lastPayer.occurred_at, now) >= 30) {
    triggers.push({ kind: 'payer_non_responsive_30d', detail: `No payer activity for ${daysSince(lastPayer.occurred_at, now)}d.` });
  }
  if (claim.intel.aging_days >= TIMELY_FILING_DAYS) {
    triggers.push({ kind: 'timely_filing_risk', detail: `${claim.intel.aging_days}d past submission — appeal window closing.` });
  }

  if (triggers.length === 0) return null;

  // Level ladder — based on trigger composition + severity + value
  let level: EscalationLevel = 1;
  if (sla.state === 'breached' || triggers.some(t => t.kind === 'appeal_rejected')) level = 2;
  if (claim.intel.amount_at_risk_cents >= HIGH_VALUE_CENTS || triggers.length >= 3 || triggers.some(t => t.kind === 'aging_120')) level = 3;
  if (claim.intel.severity === 'critical' && (triggers.some(t => t.kind === 'sla_breach') || triggers.some(t => t.kind === 'timely_filing_risk'))) level = 4;
  if (claim.intel.amount_at_risk_cents >= 500_000_00 && sla.state === 'breached') level = 4;

  const recommended_owner =
    level === 4 ? 'Executive Review (VP RCM)'
    : level === 3 ? 'Department Manager · Recovery Ops'
    : level === 2 ? 'Supervisor · Appeals & Denials'
    : assignment?.assignee ?? 'Assigned Owner';

  return {
    claim_id: claim.claim_id,
    level,
    triggers,
    recommended_owner,
    at_risk_cents: claim.intel.amount_at_risk_cents,
    age_days: claim.intel.aging_days,
    severity: claim.intel.severity,
    payer_name: claim.intel.payer_name,
  };
}

export function detectEscalations(claims: C[], assignments: Record<string, Assignment>, now: number = Date.now()): EscalationCandidate[] {
  const out: EscalationCandidate[] = [];
  for (const c of claims) {
    const e = detectEscalation(c, assignments[c.claim_id], now);
    if (e) out.push(e);
  }
  return out.sort((a, b) => (b.level - a.level) || (b.at_risk_cents - a.at_risk_cents));
}
