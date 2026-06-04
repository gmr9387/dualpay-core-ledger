/**
 * Executive Value — total value realization & monthly trend (Phase 11).
 */
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useClarityData, formatCentsCompact, formatCents } from '@/hooks/use-clarity-data';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import {
  computeValueRealization, recoveredByMonth, recoveredByCategory,
  recoveredByPayer, buildNarrative,
} from '@/engine/value-realization';

export default function ExecutiveValue() {
  const { data: claims, isLoading } = useClarityData();
  const { outcomes, loading } = useOutcomes();

  const view = useMemo(() => {
    if (!claims) return null;
    return {
      value: computeValueRealization(claims, outcomes),
      monthly: recoveredByMonth(outcomes),
      categories: recoveredByCategory(outcomes),
      payers: recoveredByPayer(outcomes),
      narrative: buildNarrative(claims, outcomes),
    };
  }, [claims, outcomes]);

  if (isLoading || loading || !view) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading value realization…
    </div>;
  }

  const { value, monthly, categories, payers, narrative } = view;
  const maxMonth = Math.max(1, ...monthly.map(m => m.recovered_cents));
  const maxCat   = Math.max(1, ...categories.map(c => c.recovered_cents));
  const maxPay   = Math.max(1, ...payers.map(p => p.recovered_cents));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Value Realization" subtitle="Lifetime and period-on-period view of dollars recovered." />
      <KpiStrip tiles={[
        { label: 'Total At Risk',       value: formatCentsCompact(value.total_at_risk_cents),  tone: 'amount-negative' },
        { label: 'Total Denied',        value: formatCentsCompact(value.total_denied_cents),   tone: 'amount-negative' },
        { label: 'Total Recovered',     value: formatCentsCompact(value.total_recovered_cents),tone: 'amount-positive' },
        { label: 'Recovery Rate',       value: value.insufficient ? '—' : `${(value.recovery_rate * 100).toFixed(1)}%`, tone: 'text-status-paid' },
        { label: 'Expected Future',     value: formatCentsCompact(value.expected_future_recovery_cents), tone: 'text-primary' },
        { label: 'Open Recoverable',    value: formatCentsCompact(value.open_recoverable_cents) },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-2 gap-4 p-5">
          <Panel title="Executive Narrative">
            {narrative ? (
              <p className="text-[13px] leading-relaxed text-foreground">{narrative}</p>
            ) : (
              <div className="text-[12.5px] text-muted-foreground">
                <b className="text-foreground">Insufficient Outcome History.</b>{' '}
                Log at least 5 resolutions to enable narrative generation.
              </div>
            )}
          </Panel>

          <Panel title="Recovered by Month">
            {monthly.length === 0 ? <EmptyState title="No monthly history" /> : (
              <div className="space-y-2">
                {monthly.map(m => (
                  <div key={m.period} className="grid grid-cols-[80px_1fr_120px_60px] gap-3 items-center">
                    <span className="font-mono text-[11.5px] text-muted-foreground">{m.period}</span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-paid/70" style={{ width: `${(m.recovered_cents / maxMonth) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right amount-positive">{formatCents(m.recovered_cents)}</span>
                    <span className="font-mono text-[11px] text-right text-muted-foreground">{(m.recovery_rate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recovered by Category">
            {categories.length === 0 ? <EmptyState title="No outcomes" /> : (
              <div className="space-y-2">
                {categories.map(c => (
                  <div key={c.category} className="grid grid-cols-[180px_1fr_120px] gap-3 items-center">
                    <span className="text-[12.5px] text-foreground truncate">{c.label}</span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-paid/60" style={{ width: `${(c.recovered_cents / maxCat) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right amount-positive">{formatCents(c.recovered_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recovered by Payer">
            {payers.length === 0 ? <EmptyState title="No outcomes" /> : (
              <div className="space-y-2">
                {payers.map(p => (
                  <div key={p.payer_id} className="grid grid-cols-[180px_1fr_120px] gap-3 items-center">
                    <span className="text-[12.5px] text-foreground truncate">{p.payer_name}</span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-paid/60" style={{ width: `${(p.recovered_cents / maxPay) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right amount-positive">{formatCents(p.recovered_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
