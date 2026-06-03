/**
 * SLA Management — heatmaps, breach counts, owner performance.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, SeverityBadge } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import { useOpsEvents } from '@/hooks/use-ops-events';
import { SLA_LABEL, SLA_RULES, evaluateSla, summarizeSla } from '@/engine/sla';
import { Loader2, ShieldAlert, Check } from 'lucide-react';
import type { DenialSeverity } from '@/types/clarity';

const SEVERITIES: DenialSeverity[] = ['critical', 'high', 'medium', 'low'];

export default function SLAManagement() {
  const { data: claims, isLoading } = useClarityData();
  const { store } = useAssignments();
  const { append } = useOpsEvents();

  const view = useMemo(() => {
    if (!claims) return null;
    const summary = summarizeSla(claims, store);
    const rows = claims
      .filter(c => c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved')
      .map(c => ({ c, sla: evaluateSla(c) }))
      .sort((a, b) => {
        const order = { breached: 0, warning: 1, healthy: 2 } as const;
        return (order[a.sla.state] - order[b.sla.state]) || (b.c.intel.amount_at_risk_cents - a.c.intel.amount_at_risk_cents);
      });
    return { summary, rows };
  }, [claims, store]);

  if (isLoading || !view) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const totalActive = view.summary.healthy + view.summary.warning + view.summary.breached;
  const breachRate = totalActive ? (view.summary.breached / totalActive) : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="SLA Management" subtitle="Deterministic SLA rules by severity. Track warnings, breaches, and owner accountability." />
      <KpiStrip tiles={[
        { label: 'Active Claims',  value: String(totalActive) },
        { label: 'Healthy',        value: String(view.summary.healthy),  tone: 'text-status-paid' },
        { label: 'Warning',        value: `${view.summary.warning} · ${formatCentsCompact(view.summary.warning_at_risk_cents)}`,  tone: 'text-status-pending' },
        { label: 'Breached',       value: `${view.summary.breached} · ${formatCentsCompact(view.summary.breach_at_risk_cents)}`, tone: 'text-status-denied' },
        { label: 'Breach Rate',    value: `${(breachRate * 100).toFixed(1)}%`, tone: breachRate > 0.1 ? 'text-status-denied' : 'text-status-paid' },
      ]} />
      <ScrollBody>
        <div className="p-5 space-y-4">
          <Panel title="SLA Rule Catalog" dense>
            <div className="divide-y">
              <div className="grid grid-cols-[140px_1fr_180px_180px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                <span>Severity</span><span>Rule</span><span>Warning at</span><span>Breach at</span>
              </div>
              {SEVERITIES.map(s => (
                <div key={s} className="grid grid-cols-[140px_1fr_180px_180px] gap-3 px-4 py-2.5 items-center text-[12.5px]">
                  <SeverityBadge severity={s} />
                  <span className="text-muted-foreground">{SLA_LABEL[s]}</span>
                  <span className="font-mono">{SLA_RULES[s].warning_hours}h</span>
                  <span className="font-mono">{SLA_RULES[s].breach_hours}h</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="SLA Heatmap · State × Severity" dense>
            <div className="p-4">
              <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-2 text-[11px]">
                <span></span>
                <span className="font-semibold text-status-paid text-center">Healthy</span>
                <span className="font-semibold text-status-pending text-center">Warning</span>
                <span className="font-semibold text-status-denied text-center">Breached</span>
                {SEVERITIES.map(s => {
                  const row = view.summary.by_severity[s];
                  const max = Math.max(1, row.healthy, row.warning, row.breached);
                  return (
                    <>
                      <span key={`l-${s}`} className="font-mono uppercase text-[10px] flex items-center"><SeverityBadge severity={s} /></span>
                      <Cell key={`h-${s}`} count={row.healthy}  intensity={row.healthy / max}  tone="bg-status-paid"   />
                      <Cell key={`w-${s}`} count={row.warning}  intensity={row.warning / max}  tone="bg-status-pending" />
                      <Cell key={`b-${s}`} count={row.breached} intensity={row.breached / max} tone="bg-status-denied" />
                    </>
                  );
                })}
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-4">
            <Panel title="Owner SLA Performance" dense>
              <div className="divide-y">
                <div className="grid grid-cols-[1fr_50px_50px_50px_90px] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Owner</span><span>OK</span><span>Warn</span><span>Brch</span><span className="text-right">At Risk</span>
                </div>
                {view.summary.by_owner.slice(0, 12).map(o => (
                  <div key={o.owner} className="grid grid-cols-[1fr_50px_50px_50px_90px] gap-2 items-center px-4 py-2 text-[12px]">
                    <span className="truncate text-foreground">{o.owner}</span>
                    <span className="font-mono text-status-paid">{o.healthy}</span>
                    <span className="font-mono text-status-pending">{o.warning}</span>
                    <span className="font-mono text-status-denied">{o.breached}</span>
                    <span className="font-mono text-right tabular-nums amount-negative">{formatCentsCompact(o.at_risk_cents)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="At-Risk Claims" action={<span className="text-[11px] text-muted-foreground font-mono">{view.rows.filter(r => r.sla.state !== 'healthy').length} flagged</span>} dense>
              <div className="divide-y max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-[90px_1fr_60px_70px] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0">
                  <span>Claim</span><span>Payer</span><span>State</span><span className="text-right">Risk</span>
                </div>
                {view.rows.filter(r => r.sla.state !== 'healthy').slice(0, 30).map(({ c, sla }) => (
                  <Link key={c.claim_id} to={`/denials/${c.claim_id}`}
                    className="grid grid-cols-[90px_1fr_60px_70px] gap-2 items-center px-4 py-2 hover:bg-muted/40 text-[11.5px]">
                    <span className="font-mono text-foreground">{c.claim_id}</span>
                    <span className="truncate">{c.intel.payer_name}</span>
                    <span className={`font-mono text-[10.5px] uppercase ${sla.state === 'breached' ? 'text-status-denied' : 'text-status-pending'}`}>{sla.state}</span>
                    <span className="font-mono text-right tabular-nums amount-negative">{formatCentsCompact(c.intel.amount_at_risk_cents)}</span>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="Acknowledge Breaches">
              <div className="text-[12.5px] text-muted-foreground space-y-3">
                <p>Acknowledging a breach writes an immutable audit event with the current SLA state. Use after triage when the breach has been triaged or remediation is in flight.</p>
                <button
                  className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                  disabled={view.summary.breached === 0}
                  onClick={() => append({
                    kind: 'sla_acknowledged',
                    summary: `Bulk-acknowledged ${view.summary.breached} SLA breaches (${formatCents(view.summary.breach_at_risk_cents)} at risk).`,
                    payload: { count: view.summary.breached },
                  })}
                >
                  <Check className="h-3.5 w-3.5" /> Acknowledge {view.summary.breached} breach(es)
                </button>
                {view.summary.breached === 0 && (
                  <div className="text-[11.5px] text-status-paid inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> No active breaches.</div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Cell({ count, intensity, tone }: { count: number; intensity: number; tone: string }) {
  const opacity = count === 0 ? 0.05 : Math.max(0.15, Math.min(1, intensity));
  return (
    <div className={`relative h-10 rounded border ${tone}`} style={{ opacity }}>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-[13px] text-white" style={{ opacity: 1 }}>{count}</span>
    </div>
  );
}
