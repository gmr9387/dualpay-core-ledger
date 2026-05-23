/**
 * Team Operations aggregator.
 *
 * Combines client-side assignment store with claim intel to produce
 * per-assignee workload, overdue counts, recovery outcomes, and
 * unassigned backlog.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import type { Assignment } from '@/lib/assignments';
import { explainRecoverability } from './recoverability';

export interface TeamMemberStats {
  assignee: string;
  active_count: number;
  in_progress_count: number;
  snoozed_count: number;
  resolved_count: number;
  overdue_count: number;
  total_at_risk_cents: number;
  expected_recovery_cents: number;
  recovered_cents: number;
  avg_recoverability: number;
}

type C = Claim & { intel: ClaimIntel };

export function aggregateTeam(
  claims: C[],
  assignments: Record<string, Assignment>,
): { members: TeamMemberStats[]; unassigned: C[]; unassigned_at_risk_cents: number } {
  const byAssignee = new Map<string, C[]>();
  const unassigned: C[] = [];

  for (const c of claims) {
    const a = assignments[c.claim_id];
    if (!a?.assignee) {
      if (c.intel.amount_at_risk_cents > 0 && c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved') {
        unassigned.push(c);
      }
      continue;
    }
    const arr = byAssignee.get(a.assignee) ?? [];
    arr.push(c);
    byAssignee.set(a.assignee, arr);
  }

  const now = Date.now();
  const members: TeamMemberStats[] = [...byAssignee.entries()].map(([assignee, list]) => {
    let inProg = 0, snoozed = 0, resolved = 0, overdue = 0;
    let totalRisk = 0, expected = 0, recovered = 0, recovSum = 0;
    for (const c of list) {
      const a = assignments[c.claim_id];
      if (a?.status === 'in_progress') inProg++;
      if (a?.status === 'snoozed') snoozed++;
      if (a?.status === 'resolved') resolved++;
      if (new Date(c.intel.sla_due_at).getTime() < now && a?.status !== 'resolved') overdue++;
      totalRisk += c.intel.amount_at_risk_cents;
      const exp = explainRecoverability(c);
      expected += Math.round(c.intel.amount_at_risk_cents * exp.score / 100);
      recovSum += exp.score;
      recovered += c.intel.appeals.reduce((s, ap) => s + (ap.amount_recovered_cents ?? 0), 0);
    }
    return {
      assignee,
      active_count: list.length,
      in_progress_count: inProg,
      snoozed_count: snoozed,
      resolved_count: resolved,
      overdue_count: overdue,
      total_at_risk_cents: totalRisk,
      expected_recovery_cents: expected,
      recovered_cents: recovered,
      avg_recoverability: list.length ? Math.round(recovSum / list.length) : 0,
    };
  }).sort((a, b) => b.expected_recovery_cents - a.expected_recovery_cents);

  return {
    members, unassigned,
    unassigned_at_risk_cents: unassigned.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0),
  };
}
