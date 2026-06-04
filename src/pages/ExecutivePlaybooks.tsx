/**
 * Executive Playbooks — effectiveness ranking (Phase 11).
 */
import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { formatCentsCompact, formatCents } from '@/hooks/use-clarity-data';
import { rankPlaybooks } from '@/engine/playbook-effectiveness';

export default function ExecutivePlaybooks() {
  const { outcomes, loading } = useOutcomes();
  const rankings = useMemo(() => rankPlaybooks(outcomes), [outcomes]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading playbook performance…
    </div>;
  }

  const ranked = rankings.filter(r => !r.insufficient);
  const totalRecovered = rankings.reduce((s, r) => s + r.total_recovered_cents, 0);
  const totalRuns = rankings.reduce((s, r) => s + r.usage_count, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Playbook Effectiveness" subtitle="Which recovery playbooks actually convert denials into dollars." />
      <KpiStrip tiles={[
        { label: 'Playbooks Tracked', value: String(rankings.length) },
        { label: 'Total Runs',        value: String(totalRuns) },
        { label: 'Total Recovered',   value: formatCentsCompact(totalRecovered), tone: 'amount-positive' },
        { label: 'Ranked (≥5 runs)',  value: String(ranked.length) },
      ]} />
      <ScrollBody>
        <div className="p-5">
          <Panel title="Playbook Rankings">
            {rankings.length === 0 ? (
              <EmptyState title="No playbook usage yet" body="Log resolutions with playbooks in the Outcome Log." />
            ) : (
              <div className="divide-y -my-4">
                <div className="grid grid-cols-[40px_1fr_90px_110px_140px_90px_90px] gap-3 px-0 py-2 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <span>#</span><span>Playbook</span><span className="text-right">Runs</span><span className="text-right">Recovery %</span><span className="text-right">Total $</span><span className="text-right">Avg Days</span><span className="text-right">Appeal %</span>
                </div>
                {rankings.map((p, i) => (
                  <div key={p.playbook} className="grid grid-cols-[40px_1fr_90px_110px_140px_90px_90px] gap-3 py-2.5 items-center">
                    <span className="font-mono text-[12px] text-muted-foreground">{i + 1}</span>
                    <span className="text-[13px] text-foreground">
                      {p.label}
                      {p.insufficient && <span className="ml-1.5 text-[10px] font-mono text-muted-foreground/70">·insufficient</span>}
                    </span>
                    <span className="text-right font-mono text-[12.5px] text-foreground">{p.usage_count}</span>
                    <span className="text-right font-mono text-[12.5px] text-status-paid">{p.insufficient ? '—' : `${(p.recovery_rate * 100).toFixed(0)}%`}</span>
                    <span className="text-right font-mono text-[12.5px] amount-positive">{formatCents(p.total_recovered_cents)}</span>
                    <span className="text-right font-mono text-[12.5px] text-muted-foreground">{p.avg_resolution_days.toFixed(0)}d</span>
                    <span className="text-right font-mono text-[12.5px] text-status-cob">{p.insufficient ? '—' : `${(p.appeal_success_rate * 100).toFixed(0)}%`}</span>
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
