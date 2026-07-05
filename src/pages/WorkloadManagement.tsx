/**
 * Workload Management — load distribution, overloaded vs underutilized
 * users, unassigned backlog with rapid rebalancing actions.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState, SeverityBadge } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import { useOpsEvents } from '@/hooks/use-ops-events';
import { aggregateTeam } from '@/engine/team-ops';
import { evaluateSla } from '@/engine/sla';

import { Loader2, Scale, UserPlus, AlertOctagon } from 'lucide-react';

export default function WorkloadManagement() {
  const { data: claims, isLoading } = useClarityData();
  const { store, assign, assignees } = useAssignments();
  const { append } = useOpsEvents();

  const roster = useMemo(() => assignees.map(a => a.user_id), [assignees]);

  const data = useMemo(() => {
    if (!claims) return null;
    const team = aggregateTeam(claims, store);
    const avgLoad = team.members.length ? team.members.reduce((s, m) => s + m.active_count, 0) / team.members.length : 0;
    const overloaded = team.members.filter(m => m.active_count > avgLoad * 1.4 && avgLoad > 0);
    const underutilized = roster.map(a => team.members.find(m => m.assignee === a) ?? { assignee: a, active_count: 0, in_progress_count: 0, snoozed_count: 0, resolved_count: 0, overdue_count: 0, total_at_risk_cents: 0, expected_recovery_cents: 0, recovered_cents: 0, avg_recoverability: 0 })
      .filter(m => m.active_count < Math.max(1, avgLoad * 0.6));
    const critical = claims.filter(c => c.intel.severity === 'critical' && c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved');
    const breached = claims.filter(c => {
      if (c.intel.reimbursement_state === 'paid' || c.intel.reimbursement_state === 'resolved') return false;
      return evaluateSla(c).state === 'breached';
    });
    return { team, avgLoad, overloaded, underutilized, critical, breached };
  }, [claims, store, roster]);

  if (isLoading || !data) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const totalActive = data.team.members.reduce((s, m) => s + m.active_count, 0);
  const maxLoad = Math.max(1, ...roster.map(a => data.team.members.find(m => m.assignee === a)?.active_count ?? 0));

  const rebalance = () => {
    // Take the most-overloaded owner and move their oldest claims to the most-underutilized owner.
    if (data.overloaded.length === 0 || data.underutilized.length === 0 || !claims) return;
    const from = data.overloaded[0];
    const to = data.underutilized[0];
    const moves = Math.min(3, Math.floor((from.active_count - data.avgLoad) / 2) || 1);
    const fromClaims = claims
      .filter(c => store[c.claim_id]?.assignee === from.assignee)
      .sort((a, b) => b.intel.aging_days - a.intel.aging_days)
      .slice(0, moves);
    for (const c of fromClaims) {
      assign(c.claim_id, to.assignee);
      append({ kind: 'assignment_changed', claim_id: c.claim_id, summary: `Rebalanced ${c.claim_id} from ${from.assignee} → ${to.assignee}.`, payload: { from: from.assignee, to: to.assignee } });
    }
  };

  const autoAssign = () => {
    if (!data.team.unassigned.length || roster.length === 0) return;
    data.team.unassigned.forEach((c, i) => {
      const to = roster[i % roster.length];
      assign(c.claim_id, to);
      append({ kind: 'assignment_changed', claim_id: c.claim_id, summary: `Auto-assigned ${c.claim_id} → ${to}.`, payload: { from: null, to } });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Workload Management"
        subtitle="Recovery-team load balance, critical & breached distribution, and rapid rebalancing."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={autoAssign} disabled={data.team.unassigned.length === 0} className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 border hover:bg-muted disabled:opacity-50">
              <UserPlus className="h-3.5 w-3.5" /> Auto-assign backlog ({data.team.unassigned.length})
            </button>
            <button onClick={rebalance} disabled={data.overloaded.length === 0 || data.underutilized.length === 0} className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground">
              <Scale className="h-3.5 w-3.5" /> Rebalance
            </button>
          </div>
        }
      />
      <KpiStrip tiles={[
        { label: 'Active Assignments', value: String(totalActive) },
        { label: 'Avg / Owner',        value: data.avgLoad.toFixed(1) },
        { label: 'Overloaded',         value: String(data.overloaded.length), tone: data.overloaded.length > 0 ? 'text-status-denied' : 'text-status-paid' },
        { label: 'Underutilized',      value: String(data.underutilized.length), tone: 'text-status-pending' },
        { label: 'Unassigned',         value: `${data.team.unassigned.length} · ${formatCentsCompact(data.team.unassigned_at_risk_cents)}`, tone: 'text-status-pending' },
        { label: 'Critical Open',      value: String(data.critical.length), tone: 'text-status-denied' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Load Distribution" dense>
              <div className="divide-y">
                <div className="grid grid-cols-[1fr_50px_60px_60px_140px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Owner</span><span>Claims</span><span>Critical</span><span>Breach</span><span>Load</span><span className="text-right">At Risk</span>
                </div>
                {roster.length === 0 ? (
                  <div className="p-6"><EmptyState title="No team members yet" body="Invite staff from Admin Console to see workload distribution." /></div>
                ) : roster.map(a => {
                  const memberMeta = assignees.find(x => x.user_id === a);
                  const label = memberMeta ? `${memberMeta.name} · ${memberMeta.role}` : a;
                  const m = data.team.members.find(x => x.assignee === a);
                  const owned = claims!.filter(c => store[c.claim_id]?.assignee === a);
                  const critCount = owned.filter(c => c.intel.severity === 'critical').length;
                  const brchCount = owned.filter(c => c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved' && evaluateSla(c).state === 'breached').length;
                  const load = m?.active_count ?? 0;
                  const status = load > data.avgLoad * 1.4 ? 'overloaded' : load < data.avgLoad * 0.6 ? 'underutilized' : 'balanced';
                  const tone = status === 'overloaded' ? 'bg-status-denied' : status === 'underutilized' ? 'bg-status-pending' : 'bg-status-paid';
                  return (
                    <div key={a} className="grid grid-cols-[1fr_50px_60px_60px_140px_120px] gap-3 items-center px-4 py-2.5 text-[12.5px]">
                      <div>
                        <div className="text-foreground font-medium truncate">{label}</div>
                        <div className="text-[10.5px] font-mono uppercase tracking-wider" style={{ color: status === 'overloaded' ? 'hsl(var(--status-denied))' : status === 'underutilized' ? 'hsl(var(--status-pending))' : 'hsl(var(--status-paid))' }}>{status}</div>
                      </div>
                      <span className="font-mono">{load}</span>
                      <span className={`font-mono ${critCount > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{critCount}</span>
                      <span className={`font-mono ${brchCount > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{brchCount}</span>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${tone}`} style={{ width: `${(load / maxLoad) * 100}%` }} />
                      </div>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCentsCompact(m?.total_at_risk_cents ?? 0)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title={`Unassigned Backlog (${data.team.unassigned.length})`} dense>
              {data.team.unassigned.length === 0 ? (
                <div className="p-6"><EmptyState title="Backlog empty" body="Every active claim has an owner." /></div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[110px_1fr_90px_70px_110px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Claim</span><span>Payer</span><span>Severity</span><span>Aging</span><span className="text-right">At Risk</span>
                  </div>
                  {data.team.unassigned.slice(0, 30).map(c => (
                    <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="grid grid-cols-[110px_1fr_90px_70px_110px] gap-3 items-center px-4 py-2 hover:bg-muted/40 text-[12px]">
                      <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
                      <span className="text-foreground truncate">{c.intel.payer_name}</span>
                      <SeverityBadge severity={c.intel.severity} />
                      <span className="font-mono text-muted-foreground">{c.intel.aging_days}d</span>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCents(c.intel.amount_at_risk_cents)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            {data.overloaded.length > 0 && (
              <div className="rounded border bg-status-denied/5 border-status-denied/30 p-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertOctagon className="h-4 w-4 text-status-denied mt-0.5" />
                  <div className="text-[12px] font-semibold text-foreground">Overloaded Owners</div>
                </div>
                <ul className="space-y-1 text-[12px]">
                  {data.overloaded.map(m => (
                    <li key={m.assignee} className="flex justify-between"><span>{m.assignee}</span><span className="font-mono text-status-denied">{m.active_count}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {data.underutilized.length > 0 && (
              <div className="rounded border bg-status-pending/5 border-status-pending/30 p-3">
                <div className="text-[12px] font-semibold text-foreground mb-2">Underutilized Capacity</div>
                <ul className="space-y-1 text-[12px]">
                  {data.underutilized.map(m => (
                    <li key={m.assignee} className="flex justify-between"><span>{m.assignee}</span><span className="font-mono text-status-pending">{m.active_count}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <Panel title="Routing Rationale">
              <p className="text-[12px] text-muted-foreground">Rebalance moves the oldest claims from the most-overloaded owner to the most-underutilized owner, preserving severity and SLA classification. Auto-assign distributes the unassigned backlog round-robin. Every reassignment writes to the audit log.</p>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
