/**
 * Team Operations — assignee workload, overdue counts, recovery
 * outcomes, and unassigned backlog.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import { aggregateTeam } from '@/engine/team-ops';
import { loadOrgAssignees, type OrgAssignee } from '@/lib/assignments';
import { useOrg } from '@/hooks/use-org';
import { Loader2, Users, UserPlus, AlertOctagon } from 'lucide-react';

export default function TeamOperations() {
  const { data: claims, isLoading } = useClarityData();
  const { store, assign } = useAssignments();
  const { currentOrg } = useOrg();
  const [assignees, setAssignees] = useState<OrgAssignee[]>([]);

  useEffect(() => {
    if (!currentOrg) { setAssignees([]); return; }
    loadOrgAssignees(currentOrg.org_id).then(setAssignees);
  }, [currentOrg]);

  const team = useMemo(() => {
    if (!claims) return null;
    return aggregateTeam(claims, store);
  }, [claims, store]);

  if (isLoading || !team) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  // Auto-assign helper: round-robin unassigned to real org members
  const autoAssign = () => {
    if (assignees.length === 0) return;
    team.unassigned.forEach((c, i) => assign(c.claim_id, assignees[i % assignees.length].user_id));
  };

  const totalActive = team.members.reduce((s, m) => s + m.active_count, 0);
  const totalOverdue = team.members.reduce((s, m) => s + m.overdue_count, 0);
  const totalExpected = team.members.reduce((s, m) => s + m.expected_recovery_cents, 0);
  const totalRecovered = team.members.reduce((s, m) => s + m.recovered_cents, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Team Operations"
        subtitle="Recovery team workload, overdue items, and outcome performance."
        actions={
          <button onClick={autoAssign} disabled={team.unassigned.length === 0}
            className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" /> Auto-assign backlog
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Team Members',          value: String(team.members.length || assignees.length) },
        { label: 'Active Assignments',    value: String(totalActive) },
        { label: 'Overdue Items',         value: String(totalOverdue),                          tone: totalOverdue > 0 ? 'text-status-denied' : 'text-status-paid' },
        { label: 'Expected Recovery',     value: formatCentsCompact(totalExpected),             tone: 'amount-positive' },
        { label: 'Recovered to Date',     value: formatCentsCompact(totalRecovered),            tone: 'amount-positive' },
        { label: 'Unassigned Backlog',    value: `${team.unassigned.length} · ${formatCentsCompact(team.unassigned_at_risk_cents)}`, tone: 'text-status-pending' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title={`Recovery Team Performance (${team.members.length})`} dense>
              {team.members.length === 0 ? (
                <div className="p-6"><EmptyState title="No assignments yet" body="Assign claims from the worklist or use Auto-assign to get started." icon={<Users className="h-5 w-5" />} /></div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[1fr_70px_70px_70px_70px_120px_140px_140px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Member</span><span>Active</span><span>Working</span><span>Resolved</span><span>Overdue</span><span>Avg Recov.</span>
                    <span className="text-right">At Risk</span><span className="text-right">Expected Rec.</span>
                  </div>
                  {team.members.map(m => (
                    <div key={m.assignee} className="grid grid-cols-[1fr_70px_70px_70px_70px_120px_140px_140px] gap-3 items-center px-4 py-2.5 text-[12.5px]">
                      <div>
                        <div className="text-foreground font-medium">{m.assignee}</div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">{m.snoozed_count} snoozed</div>
                      </div>
                      <span className="font-mono">{m.active_count}</span>
                      <span className="font-mono text-status-cob">{m.in_progress_count}</span>
                      <span className="font-mono text-status-paid">{m.resolved_count}</span>
                      <span className={`font-mono ${m.overdue_count > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{m.overdue_count}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${m.avg_recoverability >= 60 ? 'bg-status-paid' : m.avg_recoverability >= 35 ? 'bg-status-pending' : 'bg-status-denied'}`} style={{ width: `${m.avg_recoverability}%` }} />
                        </div>
                        <span className="font-mono text-[11px]">{m.avg_recoverability}</span>
                      </div>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCents(m.total_at_risk_cents)}</span>
                      <span className="font-mono text-right tabular-nums amount-positive">≈{formatCents(m.expected_recovery_cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={`Unassigned Backlog (${team.unassigned.length})`} dense>
              {team.unassigned.length === 0 ? (
                <div className="p-6"><EmptyState title="Backlog empty" body="Every recoverable claim has an owner." icon={<Users className="h-5 w-5" />} /></div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[110px_1fr_120px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Claim</span><span>Payer</span><span className="text-right">At Risk</span><span>Aging</span>
                  </div>
                  {team.unassigned.slice(0, 20).map(c => (
                    <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="grid grid-cols-[110px_1fr_120px_120px] gap-3 items-center px-4 py-2 hover:bg-muted/40 text-[12px]">
                      <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
                      <span className="text-foreground truncate">{c.intel.payer_name}</span>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCents(c.intel.amount_at_risk_cents)}</span>
                      <span className="font-mono text-muted-foreground">{c.intel.aging_days}d</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Roster">
              <ul className="space-y-1.5 text-[12.5px]">
                {assignees.map(a => {
                  const m = team.members.find(x => x.assignee === a.user_id);
                  return (
                    <li key={a.user_id} className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate">{a.name} <span className="text-[10px] text-muted-foreground font-mono">· {a.role}</span></span>
                      <span className="font-mono text-[11px] text-muted-foreground">{m?.active_count ?? 0}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
            {totalOverdue > 0 && (
              <div className="rounded border bg-status-denied/5 border-status-denied/30 p-3 flex items-start gap-2">
                <AlertOctagon className="h-4 w-4 text-status-denied mt-0.5" />
                <div className="text-[12px] text-foreground">
                  <div className="font-semibold">{totalOverdue} overdue item(s) across the team.</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Review the worklist and re-prioritise or escalate stalled claims.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
