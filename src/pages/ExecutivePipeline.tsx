/**
 * Executive Recovery Pipeline — dollars-first view of the recovery
 * funnel.  Complements the kanban Recovery Pipeline by focusing
 * on stage value, aging, and owner distribution.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';

import { buildForecast } from '@/engine/forecasting';
import { detectEscalations } from '@/engine/escalations';
import { summarizeSla } from '@/engine/sla';
import type { ClarityClaim } from '@/hooks/use-clarity-data';
import { Loader2, GitBranch, ArrowRight, AlertOctagon, Timer } from 'lucide-react';

type Stage =
  | 'New Denials'
  | 'Assigned'
  | 'Evidence Gathering'
  | 'Appeal Drafting'
  | 'Appeal Submitted'
  | 'Payer Review'
  | 'Recovery Pending'
  | 'Recovered'
  | 'Written Off';

const STAGES: Stage[] = [
  'New Denials','Assigned','Evidence Gathering','Appeal Drafting','Appeal Submitted','Payer Review','Recovery Pending','Recovered','Written Off',
];

function classify(c: ClarityClaim, assigned: boolean): Stage {
  const i = c.intel;
  if (i.reimbursement_state === 'paid' || i.reimbursement_state === 'resolved') return 'Recovered';
  if (i.appeals.some(a => a.status === 'approved' || a.status === 'partial')) return 'Recovery Pending';
  if (i.reimbursement_state === 'written_off') return 'Written Off';
  if (i.appeals.length > 0 && i.appeals.every(a => a.status === 'denied')) return 'Written Off';
  if (i.appeals.some(a => a.status === 'in_review')) return 'Payer Review';
  if (i.appeals.some(a => a.status === 'submitted')) return 'Appeal Submitted';
  if (i.appeals.some(a => a.status === 'draft')) return 'Appeal Drafting';
  if (i.evidence_missing.length > 0) return 'Evidence Gathering';
  if (assigned) return 'Assigned';
  return 'New Denials';
}

export default function ExecutivePipeline() {
  const { data: claims, isLoading } = useClarityData();
  const { store } = useAssignments();

  const view = useMemo(() => {
    if (!claims) return null;
    const buckets: Record<Stage, ClarityClaim[]> = Object.fromEntries(STAGES.map(s => [s, [] as ClarityClaim[]])) as Record<Stage, ClarityClaim[]>;
    for (const c of claims) buckets[classify(c, !!store[c.claim_id]?.assignee)].push(c);

    const fc = buildForecast(claims);
    const escalations = detectEscalations(claims, store);
    const sla = summarizeSla(claims, store);

    const recoveredCents = claims.reduce((s, c) => s + c.intel.appeals.reduce((sum, a) => sum + (a.amount_recovered_cents ?? 0), 0), 0);
    const openRecoverable = claims
      .filter(c => c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved' && c.intel.reimbursement_state !== 'written_off')
      .reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);

    const resolved = claims.filter(c => c.intel.reimbursement_state === 'paid' || c.intel.reimbursement_state === 'resolved');
    const avgDaysToResolve = resolved.length ? Math.round(resolved.reduce((s, c) => s + c.intel.aging_days, 0) / resolved.length) : 0;
    const appealsInProgress = claims.flatMap(c => c.intel.appeals).filter(a => a.status === 'draft' || a.status === 'submitted' || a.status === 'in_review').length;
    const aging120 = claims.filter(c => c.intel.aging_days > 120 && c.intel.amount_at_risk_cents > 0);
    const stalled = claims.filter(c => c.intel.is_stalled);
    const velocity = fc.total_at_risk_cents > 0 ? fc.total_expected_recovery_cents / Math.max(1, fc.buckets.length) : 0;

    return { buckets, fc, escalations, sla, recoveredCents, openRecoverable, avgDaysToResolve, appealsInProgress, aging120, stalled, velocity };
  }, [claims, store]);

  if (isLoading || !view) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const week30 = view.fc.buckets.filter(b => b.weeks_out <= 4).reduce((s, b) => s + b.expected_recovery_cents, 0);
  const week60 = view.fc.buckets.filter(b => b.weeks_out <= 8).reduce((s, b) => s + b.expected_recovery_cents, 0);
  const week90 = view.fc.buckets.filter(b => b.weeks_out <= 12).reduce((s, b) => s + b.expected_recovery_cents, 0);

  const maxStage = Math.max(1, ...STAGES.map(s => view.buckets[s].reduce((sum, c) => sum + c.intel.amount_at_risk_cents, 0)));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Executive Recovery Pipeline" subtitle="Revenue flow across the recovery lifecycle — value, aging, and owner distribution by stage." />
      <KpiStrip tiles={[
        { label: 'Open Recoverable',     value: formatCentsCompact(view.openRecoverable),   tone: 'amount-negative' },
        { label: 'Recovered',            value: formatCentsCompact(view.recoveredCents),    tone: 'amount-positive' },
        { label: 'Recovery Velocity',    value: `${formatCentsCompact(view.velocity)}/wk`,  tone: 'text-status-cob' },
        { label: 'Avg Days to Resolve',  value: view.avgDaysToResolve ? `${view.avgDaysToResolve}d` : '—' },
        { label: 'Appeals in Progress',  value: String(view.appealsInProgress),             tone: 'text-status-cob' },
        { label: 'High-Risk Aging',     value: String(view.aging120.length),                tone: 'text-status-denied' },
        { label: 'Stalled',             value: String(view.stalled.length),                 tone: 'text-status-pending' },
      ]} />
      <ScrollBody>
        <div className="p-5 space-y-4">
          <Panel title="Pipeline Stages — Count · Value · Aging · Owners" dense>
            <div className="divide-y">
              <div className="grid grid-cols-[1fr_70px_120px_90px_1fr] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                <span>Stage</span><span>Count</span><span className="text-right">Stage Value</span><span>Avg Age</span><span>Owner distribution</span>
              </div>
              {STAGES.map(stage => {
                const list = view.buckets[stage];
                const value = list.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
                const avgAge = list.length ? Math.round(list.reduce((s, c) => s + c.intel.aging_days, 0) / list.length) : 0;
                const owners = new Map<string, number>();
                for (const c of list) {
                  const o = store[c.claim_id]?.assignee ?? 'Unassigned';
                  owners.set(o, (owners.get(o) ?? 0) + 1);
                }
                const ownerList = [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
                const isTerminal = stage === 'Recovered' || stage === 'Written Off';
                return (
                  <div key={stage} className="grid grid-cols-[1fr_70px_120px_90px_1fr] gap-3 items-center px-4 py-2.5 text-[12.5px]">
                    <div>
                      <div className="text-foreground font-medium">{stage}</div>
                      <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${isTerminal ? (stage === 'Recovered' ? 'bg-status-paid' : 'bg-status-denied/60') : 'bg-primary/70'}`}
                             style={{ width: `${(value / maxStage) * 100}%` }} />
                      </div>
                    </div>
                    <span className="font-mono">{list.length}</span>
                    <span className={`font-mono text-right tabular-nums ${isTerminal && stage === 'Recovered' ? 'amount-positive' : 'amount-negative'}`}>{formatCents(value)}</span>
                    <span className="font-mono text-muted-foreground">{avgAge}d</span>
                    <div className="flex flex-wrap gap-1.5">
                      {ownerList.length === 0 ? <span className="text-[11px] text-muted-foreground italic">—</span> : ownerList.map(([o, n]) => (
                        <span key={o} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">{o.split(' ')[0]} {o.split(' ')[1] ?? ''} · {n}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-4">
            <Panel title="Forecasted Recovery" action={<Link to="/forecast" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Forecast detail <ArrowRight className="h-3 w-3" /></Link>}>
              <div className="space-y-2">
                {[
                  { label: 'Next 30 days', value: week30 },
                  { label: 'Next 60 days', value: week60 },
                  { label: 'Next 90 days', value: week90 },
                ].map(r => (
                  <div key={r.label} className="grid grid-cols-[110px_1fr_120px] gap-2 items-center text-[12.5px]">
                    <span className="text-muted-foreground">{r.label}</span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-paid/70" style={{ width: `${(r.value / Math.max(1, week90)) * 100}%` }} />
                    </div>
                    <span className="font-mono text-right tabular-nums amount-positive">{formatCents(r.value)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="SLA Posture" action={<Link to="/sla" className="text-[11.5px] text-primary hover:underline">Open SLA</Link>}>
              <div className="text-[12.5px] space-y-1.5">
                <Row label="Healthy"  value={String(view.sla.healthy)} tone="text-status-paid" />
                <Row label="Warning"  value={`${view.sla.warning} · ${formatCentsCompact(view.sla.warning_at_risk_cents)}`} tone="text-status-pending" />
                <Row label="Breached" value={`${view.sla.breached} · ${formatCentsCompact(view.sla.breach_at_risk_cents)}`} tone="text-status-denied" />
              </div>
            </Panel>

            <Panel title="Escalations" action={<Link to="/escalations" className="text-[11.5px] text-primary hover:underline">Open</Link>}>
              {view.escalations.length === 0 ? (
                <EmptyState title="No escalations" icon={<GitBranch className="h-4 w-4" />} />
              ) : (
                <ul className="space-y-1.5 text-[12.5px]">
                  {[4, 3, 2, 1].map(lvl => {
                    const count = view.escalations.filter(e => e.level === lvl).length;
                    if (count === 0) return null;
                    return <Row key={lvl} label={`Level ${lvl}`} value={String(count)} tone={lvl >= 3 ? 'text-status-denied' : 'text-status-pending'} />;
                  })}
                </ul>
              )}
            </Panel>
          </div>

          {view.stalled.length > 0 && (
            <div className="rounded border bg-status-pending/5 border-status-pending/30 p-3 flex items-start gap-2">
              <Timer className="h-4 w-4 text-status-pending mt-0.5" />
              <div className="text-[12px] text-foreground">
                <div className="font-semibold">{view.stalled.length} stalled recoveries · {formatCentsCompact(view.stalled.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0))} at risk.</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">No payer or owner activity inside the SLA window. <Link to="/escalations" className="text-primary hover:underline">Review escalations →</Link></div>
              </div>
            </div>
          )}
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${tone ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}
