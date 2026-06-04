/**
 * Executive Recovery — attribution drilldowns.
 * Phase 11.  Reuses recovery-attribution + outcome data.
 */
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { formatCentsCompact, formatCents } from '@/hooks/use-clarity-data';
import {
  attributeOutcomes, byCategory, byPayer, byPlaybook, byOwner, byResolutionType,
  type AttributionSlice,
} from '@/engine/recovery-attribution';
import { headlineMetrics } from '@/engine/outcome-analytics';
import { RESOLUTION_LABEL } from '@/types/outcomes';

const TABS = [
  { id: 'category',    label: 'Category' },
  { id: 'payer',       label: 'Payer' },
  { id: 'playbook',    label: 'Playbook' },
  { id: 'owner',       label: 'Owner' },
  { id: 'resolution',  label: 'Resolution' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function ExecutiveRecovery() {
  const { outcomes, loading } = useOutcomes();
  const [tab, setTab] = useState<TabId>('category');

  const view = useMemo(() => {
    const recs = attributeOutcomes(outcomes);
    const head = headlineMetrics(outcomes);
    const slices: Record<TabId, AttributionSlice[]> = {
      category: byCategory(recs),
      payer: byPayer(recs),
      playbook: byPlaybook(recs),
      owner: byOwner(recs),
      resolution: byResolutionType(recs).map(s => ({ ...s, label: RESOLUTION_LABEL[s.key as keyof typeof RESOLUTION_LABEL] ?? s.label })),
    };
    return { head, slices, totalAttributed: recs.length };
  }, [outcomes]);

  if (loading) return <Loader fallback="Loading attribution…" />;
  const current = view.slices[tab];
  const max = Math.max(1, ...current.map(s => s.recovered_cents));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Recovery Attribution" subtitle="Every recovered dollar mapped to its source." />
      <KpiStrip tiles={[
        { label: 'Outcomes Attributed', value: String(view.totalAttributed) },
        { label: 'Total Recovered',     value: formatCentsCompact(view.head.total_recovered_cents), tone: 'amount-positive' },
        { label: 'Total Denied',        value: formatCentsCompact(view.head.total_denied_cents),    tone: 'amount-negative' },
        { label: 'Recovery Rate',       value: view.head.insufficient ? '—' : `${(view.head.recovery_rate * 100).toFixed(1)}%`, tone: 'text-status-paid' },
      ]} />
      <div className="border-b bg-card flex gap-1 px-5">
        {TABS.map(t => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={`text-[12.5px] px-3 py-2 -mb-px border-b-2 ${
              tab === t.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{t.label}</button>
        ))}
      </div>
      <ScrollBody>
        <div className="p-5">
          <Panel title={`Recovery by ${TABS.find(t => t.id === tab)!.label}`}>
            {current.length === 0 ? (
              <EmptyState title="No outcome history" body="Log resolutions in the Outcome Log to populate this view." />
            ) : (
              <div className="space-y-2.5">
                {current.map(s => (
                  <div key={s.key} className="grid grid-cols-[200px_1fr_140px_90px] gap-3 items-center">
                    <span className="text-[12.5px] text-foreground truncate">
                      {s.label}{s.insufficient && <span className="ml-1.5 text-[10px] font-mono text-muted-foreground/70">·low n</span>}
                    </span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-paid/60" style={{ width: `${(s.recovered_cents / max) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right tabular-nums amount-positive">{formatCents(s.recovered_cents)}</span>
                    <span className="font-mono text-[11.5px] text-right tabular-nums text-muted-foreground">
                      {s.insufficient ? '—' : `${(s.recovery_rate * 100).toFixed(0)}%`}
                    </span>
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

function Loader({ fallback }: { fallback: string }) {
  return <div className="h-full flex items-center justify-center text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin mr-2" /> {fallback}
  </div>;
}
