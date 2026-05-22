/**
 * Revenue Leak Detection
 * Pattern-driven leakage view: recurring denials, payer
 * concentration, workflow bottlenecks, with estimated leakage and
 * recommended interventions.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, Panel, ScrollBody, AgingChip, SeverityBadge, EmptyState } from '@/components/clarity/primitives';
import { detectLeakPatterns, PATTERN_LABEL } from '@/engine/leak-detection';
import { Loader2, TrendingDown, Lightbulb } from 'lucide-react';

export default function RevenueLeak() {
  const { data: claims, isLoading } = useClarityData();
  const data = useMemo(() => {
    if (!claims) return null;
    const underpayments = claims.filter(c => c.intel.underpayment_cents > 0);
    const stalled = claims.filter(c => c.intel.is_stalled);
    const totalLeak = claims.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const underpayTotal = underpayments.reduce((s, c) => s + c.intel.underpayment_cents, 0);
    const recoverable = claims.filter(c => c.intel.recoverability_score >= 60).reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const buckets = ['0-30', '31-60', '61-90', '91-120', '120+'] as const;
    const byAge = buckets.map(b => ({
      bucket: b,
      amount: claims.filter(c => c.intel.aging_bucket === b).reduce((s, c) => s + c.intel.amount_at_risk_cents, 0),
      count: claims.filter(c => c.intel.aging_bucket === b && c.intel.amount_at_risk_cents > 0).length,
    }));
    const patterns = detectLeakPatterns(claims);
    return { underpayments, stalled, totalLeak, underpayTotal, recoverable, byAge, patterns };
  }, [claims]);

  if (isLoading || !data) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  const maxAge = Math.max(1, ...data.byAge.map(b => b.amount));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Revenue Leak Detection" subtitle="Pattern-driven leakage analysis with estimated value and operational interventions." />
      <KpiStrip tiles={[
        { label: 'Total Leakage',   value: formatCentsCompact(data.totalLeak),    tone: 'amount-negative' },
        { label: 'Underpayments',   value: formatCentsCompact(data.underpayTotal), tone: 'amount-negative' },
        { label: 'Recoverable',     value: formatCentsCompact(data.recoverable),   tone: 'amount-positive' },
        { label: 'Stalled Claims',  value: String(data.stalled.length),            tone: 'text-status-pending' },
        { label: 'Active Patterns', value: String(data.patterns.length),           tone: 'text-status-cob' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Leakage Patterns — Recurring Root Causes" action={<span className="text-[10.5px] font-mono text-muted-foreground">{data.patterns.length} detected</span>}>
              {data.patterns.length === 0 ? (
                <EmptyState title="No systemic patterns" body="No recurring leakage detected in current dataset." icon={<TrendingDown className="h-5 w-5" />} />
              ) : (
                <div className="space-y-3">
                  {data.patterns.map(p => (
                    <div key={p.pattern_id} className="rounded border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-status-denied/10 text-status-denied border border-status-denied/30">
                              {PATTERN_LABEL[p.kind]}
                            </span>
                            <span className="font-mono text-[10.5px] text-muted-foreground">{p.claim_count} claims</span>
                          </div>
                          <div className="text-[13px] font-semibold text-foreground">{p.title}</div>
                          <div className="text-[12px] text-muted-foreground mt-0.5">{p.root_cause}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Est. Leakage</div>
                          <div className="font-mono text-[14px] font-semibold amount-negative tabular-nums">{formatCents(p.estimated_leakage_cents)}</div>
                          <div className="text-[10.5px] amount-positive font-mono">≈{formatCents(p.recoverable_cents)} recoverable</div>
                        </div>
                      </div>
                      <div className="mt-2.5 rounded bg-accent/40 border border-primary/15 p-2 flex items-start gap-2">
                        <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5" />
                        <div className="text-[11.5px] text-foreground">{p.recommendation}</div>
                      </div>
                      {p.affected_claims.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.affected_claims.slice(0, 8).map(id => (
                            <Link key={id} to={`/denials/${id}`} className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border bg-card hover:bg-muted text-primary">
                              {id}
                            </Link>
                          ))}
                          {p.affected_claims.length > 8 && (
                            <span className="font-mono text-[10.5px] text-muted-foreground self-center">+{p.affected_claims.length - 8} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="At-Risk Reimbursement by Aging Bucket">
              <div className="space-y-2.5">
                {data.byAge.map(b => (
                  <div key={b.bucket} className="grid grid-cols-[80px_1fr_140px] gap-3 items-center">
                    <AgingChip bucket={b.bucket} />
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-denied/60" style={{ width: `${(b.amount / maxAge) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right tabular-nums text-foreground">{formatCents(b.amount)} <span className="text-[10.5px] text-muted-foreground">({b.count})</span></span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title={`Underpayments (${data.underpayments.length})`}>
              <div className="space-y-2 text-[12px]">
                {data.underpayments.map(c => (
                  <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="block rounded border bg-muted/30 p-2.5 hover:bg-muted/60">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
                      <span className="font-mono amount-negative tabular-nums">−{formatCents(c.intel.underpayment_cents)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{c.intel.payer_name}</div>
                  </Link>
                ))}
              </div>
            </Panel>
            <Panel title="Stalled Reimbursements">
              {data.stalled.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">No stalled claims.</div>
              ) : (
                <div className="space-y-2 text-[12px]">
                  {data.stalled.map(c => (
                    <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="block rounded border bg-muted/30 p-2.5 hover:bg-muted/60">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
                        <SeverityBadge severity={c.intel.severity} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{c.intel.payer_name} · {c.intel.aging_days}d</div>
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
