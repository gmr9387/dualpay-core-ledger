/**
 * Executive Payers — payer scorecards (Phase 11).
 */
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useClarityData, formatCentsCompact } from '@/hooks/use-clarity-data';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { buildPayerScorecards } from '@/engine/payer-performance';

export default function ExecutivePayers() {
  const { data: claims, isLoading } = useClarityData();
  const { outcomes, loading } = useOutcomes();

  const cards = useMemo(() => {
    if (!claims) return [];
    return buildPayerScorecards(claims, outcomes);
  }, [claims, outcomes]);

  if (isLoading || loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading payer performance…
    </div>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Payer Scorecards" subtitle="Performance, denial mix, and recovery leverage per payer." />
      <ScrollBody>
        <div className="p-5 space-y-3">
          {cards.length === 0 ? (
            <EmptyState title="No payers tracked" body="Import claims to populate payer performance." />
          ) : cards.map(p => (
            <Panel key={p.payer_id} title={p.payer_name} action={
              p.insufficient ? <span className="text-[10.5px] font-mono text-muted-foreground/70">low outcome history</span> : null
            }>
              <div className="grid grid-cols-6 gap-4 mb-3">
                <Metric label="Claims"        value={String(p.total_claims)} />
                <Metric label="Billed"        value={formatCentsCompact(p.total_billed_cents)} />
                <Metric label="Collected"     value={formatCentsCompact(p.total_collected_cents)} tone="amount-positive" />
                <Metric label="At Risk"       value={formatCentsCompact(p.total_at_risk_cents)} tone="amount-negative" />
                <Metric label="Denial Rate"   value={`${(p.denial_rate * 100).toFixed(0)}%`} tone="text-status-denied" />
                <Metric label="Underpay Rate" value={`${(p.underpayment_rate * 100).toFixed(0)}%`} />
                <Metric label="Recovery Rate" value={p.insufficient ? '—' : `${(p.recovery_rate * 100).toFixed(0)}%`} tone="text-status-paid" />
                <Metric label="Avg Days"      value={p.insufficient ? '—' : `${p.avg_recovery_days.toFixed(0)}d`} />
                <Metric label="Appeal Win"    value={p.insufficient ? '—' : `${(p.appeal_success_rate * 100).toFixed(0)}%`} tone="text-status-cob" />
                <Metric label="Outcomes"      value={String(p.outcome_count)} />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Top Denial Categories</div>
                  {p.top_denial_categories.length === 0 ? <div className="text-[12px] text-muted-foreground">None</div> :
                    p.top_denial_categories.map(c => (
                      <div key={c.category} className="flex justify-between text-[12px]">
                        <span className="text-foreground">{c.label}</span>
                        <span className="font-mono text-muted-foreground">{c.count}</span>
                      </div>
                    ))}
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Top Failure Categories</div>
                  {p.top_failure_categories.length === 0 ? <div className="text-[12px] text-muted-foreground">None</div> :
                    p.top_failure_categories.map(c => (
                      <div key={c.category} className="flex justify-between text-[12px]">
                        <span className="text-foreground">{c.label}</span>
                        <span className="font-mono amount-negative">{formatCentsCompact(c.unrecovered_cents)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </ScrollBody>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
      <div className={`text-[14px] font-mono font-semibold ${tone ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}
