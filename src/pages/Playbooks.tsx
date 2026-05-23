/**
 * Recovery Playbooks — library of denial-category strategies with
 * explainable recommendations per claim.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { PLAYBOOKS, EFFORT_CLS, type Playbook } from '@/engine/playbooks';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import type { DenialCategory } from '@/types/clarity';
import { Loader2, BookOpen, ArrowRight } from 'lucide-react';

export default function Playbooks() {
  const { data: claims, isLoading } = useClarityData();
  const [active, setActive] = useState<DenialCategory>('authorization');

  const usage = useMemo(() => {
    const m = new Map<DenialCategory, { count: number; risk: number }>();
    if (!claims) return m;
    for (const c of claims) for (const d of c.intel.denial_events) {
      const cur = m.get(d.category) ?? { count: 0, risk: 0 };
      cur.count += 1; cur.risk += d.amount_cents;
      m.set(d.category, cur);
    }
    return m;
  }, [claims]);

  const matching = useMemo(() => {
    if (!claims) return [];
    return claims.filter(c => c.intel.denial_events.some(d => d.category === active)).slice(0, 12);
  }, [claims, active]);

  if (isLoading) return <Loading />;

  const pb = PLAYBOOKS[active];
  const totalPlaybooks = Object.keys(PLAYBOOKS).length;
  const totalRisk = [...usage.values()].reduce((s, v) => s + v.risk, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Recovery Playbooks"
        subtitle="Per-category strategies: required evidence, appeal approach, effort, and expected recovery."
      />
      <KpiStrip tiles={[
        { label: 'Playbooks',           value: String(totalPlaybooks) },
        { label: 'Categories In Play',  value: String(usage.size) },
        { label: 'Total Risk Routed',   value: formatCentsCompact(totalRisk), tone: 'amount-negative' },
        { label: 'Avg Base Recovery',   value: `${Math.round(Object.values(PLAYBOOKS).reduce((s, p) => s + p.base_recovery_probability, 0) / totalPlaybooks * 100)}%`, tone: 'text-status-paid' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-[260px_1fr] gap-0 h-full">
          {/* Library */}
          <div className="border-r bg-card overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">Library</div>
            {(Object.keys(PLAYBOOKS) as DenialCategory[]).map(cat => {
              const u = usage.get(cat);
              const isActive = cat === active;
              return (
                <button key={cat} onClick={() => setActive(cat)}
                  className={`w-full text-left px-3 py-2.5 border-b text-[12.5px] flex items-center justify-between gap-2 ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{CATEGORY_LABEL[cat]}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground">
                      base {Math.round(PLAYBOOKS[cat].base_recovery_probability * 100)}% · {PLAYBOOKS[cat].estimated_minutes}m
                    </div>
                  </div>
                  {u && <span className="font-mono text-[10.5px] text-status-denied">{u.count}</span>}
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div className="p-5 space-y-4 overflow-y-auto">
            <PlaybookDetail pb={pb} />
            <Panel title={`Active Claims Matching · ${CATEGORY_LABEL[active]} (${matching.length})`} dense>
              {matching.length === 0 ? (
                <div className="p-6"><EmptyState title="No active claims" body="No open claims currently match this playbook category." icon={<BookOpen className="h-5 w-5" />} /></div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[110px_1fr_120px_120px_60px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Claim</span><span>Payer</span><span className="text-right">At Risk</span><span>Aging</span><span></span>
                  </div>
                  {matching.map(c => (
                    <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="grid grid-cols-[110px_1fr_120px_120px_60px] gap-3 items-center px-4 py-2 hover:bg-muted/40 text-[12px]">
                      <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
                      <span className="text-foreground truncate">{c.intel.payer_name}</span>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCents(c.intel.amount_at_risk_cents)}</span>
                      <span className="font-mono text-muted-foreground">{c.intel.aging_days}d</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground justify-self-end" />
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function PlaybookDetail({ pb }: { pb: Playbook }) {
  return (
    <Panel
      title={pb.title}
      action={
        <div className="flex items-center gap-1.5">
          <span className={`pill border ${EFFORT_CLS[pb.effort]}`}>{pb.effort} effort</span>
          <span className="pill border bg-status-paid/10 text-status-paid border-status-paid/30">{Math.round(pb.base_recovery_probability * 100)}% base</span>
          <span className="pill border bg-muted text-muted-foreground border-border">{pb.estimated_minutes}m</span>
        </div>
      }
    >
      <p className="text-[12.5px] text-foreground mb-3">{pb.summary}</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded border bg-muted/30 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Required Evidence</div>
          <ul className="text-[12px] space-y-1">
            {pb.required_evidence.map(e => (
              <li key={e} className="flex items-start gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" /><span>{e}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded border bg-accent/40 border-primary/20 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1.5">Appeal Strategy</div>
          <p className="text-[12px] text-foreground">{pb.appeal_strategy}</p>
        </div>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Step Sequence</div>
      <ol className="space-y-2">
        {pb.steps.map(s => (
          <li key={s.order} className="grid grid-cols-[24px_1fr] gap-3 items-start">
            <span className="font-mono text-[11px] text-primary font-semibold pt-0.5">{String(s.order).padStart(2, '0')}</span>
            <div>
              <div className="text-[12.5px] text-foreground font-medium">{s.action}</div>
              <div className="text-[11px] text-muted-foreground">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-primary/80">{s.owner}</span> · {s.rationale}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 pt-3 border-t text-[11.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">Escalation: </span>{pb.escalation_path}
      </div>
    </Panel>
  );
}

function Loading() {
  return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
}
