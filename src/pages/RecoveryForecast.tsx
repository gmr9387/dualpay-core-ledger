/**
 * Recovery Forecast — estimated recoverable revenue over time with
 * explainable assumptions.
 */
import { useMemo } from 'react';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { buildForecast } from '@/engine/forecasting';
import { Loader2, TrendingUp, Calendar, Clock, Info } from 'lucide-react';

export default function RecoveryForecast() {
  const { data: claims, isLoading } = useClarityData();
  const fc = useMemo(() => claims ? buildForecast(claims) : null, [claims]);

  if (isLoading || !fc) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const maxBucket = Math.max(1, ...fc.buckets.map(b => b.expected_recovery_cents));
  const hoursTotal = (fc.workload_minutes_total / 60).toFixed(0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Recovery Forecast" subtitle="Projected recoverable revenue, workload, and timing — based on the current pipeline." />
      <KpiStrip tiles={[
        { label: 'Total At Risk',          value: formatCentsCompact(fc.total_at_risk_cents),            tone: 'amount-negative' },
        { label: 'Expected Recovery',      value: formatCentsCompact(fc.total_expected_recovery_cents),  tone: 'amount-positive' },
        { label: 'Recovery Rate',          value: `${(fc.expected_recovery_rate * 100).toFixed(1)}%`,    tone: 'text-status-cob' },
        { label: 'Monthly Projection',     value: formatCentsCompact(fc.monthly_projection_cents),       tone: 'amount-positive' },
        { label: 'Total Workload',         value: `${hoursTotal}h`,                                       sub: 'across all claims' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Recovery Timeline">
              {fc.buckets.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">No pipeline activity yet.</div>
              ) : (
                <div className="space-y-3">
                  {fc.buckets.map(b => (
                    <div key={b.label} className="grid grid-cols-[160px_1fr_140px_100px] gap-3 items-center">
                      <div>
                        <div className="text-[12.5px] font-medium text-foreground">{b.label}</div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">{b.claim_count} claims · {Math.round(b.appeal_workload_minutes / 60)}h work</div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-status-paid/60" style={{ width: `${(b.expected_recovery_cents / maxBucket) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[13px] text-right tabular-nums amount-positive">{formatCents(b.expected_recovery_cents)}</span>
                      <span className="text-[10.5px] font-mono text-muted-foreground truncate" title={b.drivers.join(', ')}>{b.drivers[0] ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Bucket Drivers">
              <div className="space-y-2.5">
                {fc.buckets.map(b => (
                  <div key={b.label} className="rounded border bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-foreground">{b.label}</span>
                      <span className="font-mono text-[11.5px] amount-positive">≈{formatCents(b.expected_recovery_cents)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {b.drivers.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground italic">No top drivers identified.</span>
                      ) : (
                        b.drivers.map(d => <span key={d} className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-card border text-foreground">{d}</span>)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Forecast Summary" action={<TrendingUp className="h-4 w-4 text-status-paid" />}>
              <div className="space-y-2 text-[12px]">
                <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Next 30 days"        value={formatCents(fc.monthly_projection_cents)} tone="amount-positive" />
                <Row icon={<TrendingUp className="h-3.5 w-3.5" />} label="Total expected"    value={formatCents(fc.total_expected_recovery_cents)} tone="amount-positive" />
                <Row icon={<Clock className="h-3.5 w-3.5" />}     label="Workload (hours)"  value={hoursTotal} />
                <Row                                              label="Recovery rate"     value={`${(fc.expected_recovery_rate * 100).toFixed(1)}%`} />
              </div>
            </Panel>

            <Panel title="Assumptions" action={<Info className="h-4 w-4 text-muted-foreground" />}>
              <ul className="space-y-1.5 text-[11.5px] text-muted-foreground">
                {fc.assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" /><span>{a}</span></li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ icon, label, value, tone }: { icon?: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className={`font-mono ${tone ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}
