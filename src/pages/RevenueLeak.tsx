import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, Panel, ScrollBody, AgingChip, SeverityBadge } from '@/components/clarity/primitives';
import { Loader2, TrendingDown } from 'lucide-react';

export default function RevenueLeak() {
  const { data: claims, isLoading } = useClarityData();
  const data = useMemo(() => {
    if (!claims) return null;
    const underpayments = claims.filter(c => c.intel.underpayment_cents > 0);
    const stalled = claims.filter(c => c.intel.is_stalled);
    const unresolved = claims.filter(c => c.intel.reimbursement_state === 'denied' && c.intel.amount_at_risk_cents > 0);
    const totalLeak = claims.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const underpayTotal = underpayments.reduce((s, c) => s + c.intel.underpayment_cents, 0);
    const recoverable = claims.filter(c => c.intel.recoverability_score >= 60).reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    // Aging buckets
    const buckets = ['0-30', '31-60', '61-90', '91-120', '120+'] as const;
    const byAge = buckets.map(b => ({
      bucket: b,
      amount: claims.filter(c => c.intel.aging_bucket === b).reduce((s, c) => s + c.intel.amount_at_risk_cents, 0),
      count: claims.filter(c => c.intel.aging_bucket === b && c.intel.amount_at_risk_cents > 0).length,
    }));
    return { underpayments, stalled, unresolved, totalLeak, underpayTotal, recoverable, byAge };
  }, [claims]);

  if (isLoading || !data) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  const maxAge = Math.max(1, ...data.byAge.map(b => b.amount));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Revenue Leak Detection" subtitle="Underpayments, stalled reimbursements, and unresolved denials representing recoverable revenue." />
      <KpiStrip tiles={[
        { label: 'Total Leakage',   value: formatCentsCompact(data.totalLeak),    tone: 'amount-negative' },
        { label: 'Underpayments',   value: formatCentsCompact(data.underpayTotal), tone: 'amount-negative' },
        { label: 'Recoverable',     value: formatCentsCompact(data.recoverable),   tone: 'amount-positive' },
        { label: 'Stalled Claims',  value: String(data.stalled.length),            tone: 'text-status-pending' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="At-Risk Reimbursement by Aging Bucket">
              <div className="space-y-2.5">
                {data.byAge.map(b => (
                  <div key={b.bucket} className="grid grid-cols-[80px_1fr_120px] gap-3 items-center">
                    <AgingChip bucket={b.bucket} />
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-denied/60" style={{ width: `${(b.amount / maxAge) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right tabular-nums text-foreground">{formatCents(b.amount)} <span className="text-[10.5px] text-muted-foreground">({b.count})</span></span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={`Underpayments (${data.underpayments.length})`}>
              <div className="divide-y -mx-4 -my-4">
                {data.underpayments.map(c => (
                  <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="grid grid-cols-[110px_1fr_140px_120px_120px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40">
                    <span className="font-mono text-[12px] font-semibold text-foreground">{c.claim_id}</span>
                    <span className="text-[12px] text-foreground truncate">{c.intel.payer_name}</span>
                    <span className="font-mono text-[11.5px] text-muted-foreground">Expected {formatCents(c.intel.expected_reimbursement_cents)}</span>
                    <span className="font-mono text-[12px] text-muted-foreground">Paid {formatCents(c.intel.actual_reimbursement_cents)}</span>
                    <span className="font-mono text-[12.5px] text-right tabular-nums amount-negative">−{formatCents(c.intel.underpayment_cents)}</span>
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
          <div className="space-y-4">
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
