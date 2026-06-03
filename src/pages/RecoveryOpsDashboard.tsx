/**
 * Recovery Operations Dashboard — executive operational view of
 * recovery, risk, queue health, and team performance in a single
 * pane.  Stitches together existing engines; does not duplicate them.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import { summarizeSla } from '@/engine/sla';
import { detectEscalations } from '@/engine/escalations';
import { aggregateTeam } from '@/engine/team-ops';
import { buildForecast } from '@/engine/forecasting';
import { Loader2, ArrowRight, ShieldAlert, Users, GitBranch, Activity } from 'lucide-react';
import type { WorkQueueId } from '@/types/clarity';

const QUEUE_LABEL: Record<WorkQueueId, string> = {
  unresolved_denials: 'Unresolved Denials',
  high_value:         'High Value',
  appeals_in_progress:'Appeals in Progress',
  missing_docs:       'Missing Documentation',
  stalled:            'Stalled',
  escalation:         'Escalation Queue',
  aging:              'Aging > 60d',
  payer_follow_up:    'Payer Follow-up',
};

export default function RecoveryOpsDashboard() {
  const { data: claims, isLoading } = useClarityData();
  const { store } = useAssignments();

  const view = useMemo(() => {
    if (!claims) return null;
    const sla = summarizeSla(claims, store);
    const esc = detectEscalations(claims, store);
    const team = aggregateTeam(claims, store);
    const fc = buildForecast(claims);

    const open = claims.filter(c => c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved' && c.intel.reimbursement_state !== 'written_off');
    const openValue = open.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const recovered = claims.reduce((s, c) => s + c.intel.appeals.reduce((sum, a) => sum + (a.amount_recovered_cents ?? 0), 0), 0);
    const billed = claims.reduce((s, c) => s + c.total_billed, 0);
    const collected = claims.reduce((s, c) => s + c.intel.actual_reimbursement_cents, 0);
    const recoveryRate = billed > 0 ? collected / billed : 0;

    const stalled = claims.filter(c => c.intel.is_stalled);
    const aging = claims.filter(c => c.intel.aging_days > 90 && c.intel.amount_at_risk_cents > 0);

    const queueCounts = new Map<WorkQueueId, { count: number; value: number; avgAge: number }>();
    for (const c of claims) {
      for (const q of c.intel.queues) {
        const cur = queueCounts.get(q) ?? { count: 0, value: 0, avgAge: 0 };
        cur.count += 1;
        cur.value += c.intel.amount_at_risk_cents;
        cur.avgAge += c.intel.aging_days;
        queueCounts.set(q, cur);
      }
    }
    const queues = [...queueCounts.entries()].map(([q, v]) => ({ q, count: v.count, value: v.value, avgAge: Math.round(v.avgAge / Math.max(1, v.count)) })).sort((a, b) => b.value - a.value);

    return { sla, esc, team, fc, openValue, recovered, recoveryRate, stalled, aging, queues };
  }, [claims, store]);

  if (isLoading || !view) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const maxQueue = Math.max(1, ...view.queues.map(q => q.value));
  const totalActive = view.team.members.reduce((s, m) => s + m.active_count, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Recovery Operations Dashboard" subtitle="Executive view — recovery, operational risk, queue health, and team performance." />
      <KpiStrip tiles={[
        { label: 'Open Recovery Value', value: formatCentsCompact(view.openValue),   tone: 'amount-negative' },
        { label: 'Recovered',           value: formatCentsCompact(view.recovered),   tone: 'amount-positive' },
        { label: 'Recovery Rate',       value: `${(view.recoveryRate * 100).toFixed(1)}%`, tone: 'text-status-cob' },
        { label: 'Escalations',         value: String(view.esc.length), tone: view.esc.length > 0 ? 'text-status-denied' : 'text-status-paid' },
        { label: 'SLA Breaches',        value: String(view.sla.breached), tone: view.sla.breached > 0 ? 'text-status-denied' : 'text-status-paid' },
        { label: 'Stalled',             value: String(view.stalled.length), tone: 'text-status-pending' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-2 gap-4 p-5">

          <Panel title="Recovery Overview" action={<Link to="/pipeline-exec" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Open <ArrowRight className="h-3 w-3" /></Link>}>
            <div className="grid grid-cols-3 gap-3 text-[12.5px]">
              <Metric label="Open value"      value={formatCentsCompact(view.openValue)}     tone="amount-negative" />
              <Metric label="Recovered"       value={formatCentsCompact(view.recovered)}     tone="amount-positive" />
              <Metric label="30d forecast"    value={formatCentsCompact(view.fc.buckets.filter(b => b.weeks_out <= 4).reduce((s, b) => s + b.expected_recovery_cents, 0))} tone="amount-positive" />
              <Metric label="Pipeline value"  value={formatCentsCompact(view.fc.total_expected_recovery_cents)} tone="text-status-cob" />
              <Metric label="Recovery rate"   value={`${(view.recoveryRate * 100).toFixed(1)}%`} tone="text-status-cob" />
              <Metric label="Workload"        value={`${Math.round(view.fc.workload_minutes_total / 60)}h`} />
            </div>
          </Panel>

          <Panel title="Operational Risk" action={<Link to="/escalations" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Escalations <ArrowRight className="h-3 w-3" /></Link>}>
            <div className="space-y-2 text-[12.5px]">
              <Row icon={<ShieldAlert className="h-3.5 w-3.5 text-status-denied" />} label="SLA breached"   value={`${view.sla.breached} · ${formatCentsCompact(view.sla.breach_at_risk_cents)}`} to="/sla" />
              <Row icon={<GitBranch  className="h-3.5 w-3.5 text-status-denied" />} label="Escalations L3+" value={String(view.esc.filter(e => e.level >= 3).length)} to="/escalations" />
              <Row icon={<Activity   className="h-3.5 w-3.5 text-status-pending" />} label="Stalled recoveries" value={`${view.stalled.length} · ${formatCentsCompact(view.stalled.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0))}`} to="/queues/stalled" />
              <Row icon={<Activity   className="h-3.5 w-3.5 text-status-pending" />} label="Aging > 90d"   value={`${view.aging.length} · ${formatCentsCompact(view.aging.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0))}`} to="/queues/aging" />
            </div>
          </Panel>

          <Panel title="Queue Health" dense>
            <div className="divide-y">
              <div className="grid grid-cols-[1fr_60px_120px_70px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                <span>Queue</span><span>Count</span><span className="text-right">Value</span><span>Avg Age</span>
              </div>
              {view.queues.map(({ q, count, value, avgAge }) => (
                <Link key={q} to={`/queues/${q}`} className="grid grid-cols-[1fr_60px_120px_70px] gap-3 items-center px-4 py-2 hover:bg-muted/40 text-[12px]">
                  <div>
                    <div className="text-foreground font-medium">{QUEUE_LABEL[q] ?? q}</div>
                    <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/60" style={{ width: `${(value / maxQueue) * 100}%` }} />
                    </div>
                  </div>
                  <span className="font-mono">{count}</span>
                  <span className="font-mono text-right tabular-nums amount-negative">{formatCents(value)}</span>
                  <span className="font-mono text-muted-foreground">{avgAge}d</span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Team Performance" action={<Link to="/workload" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Workload <ArrowRight className="h-3 w-3" /></Link>}>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-[12.5px]">
                <Metric label="Members"  value={String(view.team.members.length)} icon={<Users className="h-3 w-3" />} />
                <Metric label="Active"   value={String(totalActive)} />
                <Metric label="Overdue"  value={String(view.team.members.reduce((s, m) => s + m.overdue_count, 0))} tone={view.team.members.some(m => m.overdue_count > 0) ? 'text-status-denied' : 'text-status-paid'} />
              </div>
              <div className="divide-y">
                {view.team.members.slice(0, 6).map(m => (
                  <div key={m.assignee} className="grid grid-cols-[1fr_50px_50px_100px] gap-2 items-center py-1.5 text-[12px]">
                    <span className="truncate text-foreground">{m.assignee}</span>
                    <span className="font-mono">{m.active_count}</span>
                    <span className={`font-mono ${m.overdue_count > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{m.overdue_count}</span>
                    <span className="font-mono text-right tabular-nums amount-positive">≈{formatCentsCompact(m.expected_recovery_cents)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}

function Metric({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded border bg-muted/30 p-2.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`mt-0.5 font-mono text-[16px] font-semibold tabular-nums ${tone ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Row({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: string; to?: string }) {
  const inner = (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </div>
  );
  return to ? <Link to={to} className="block hover:bg-muted/40 -mx-1 px-1 rounded">{inner}</Link> : inner;
}
