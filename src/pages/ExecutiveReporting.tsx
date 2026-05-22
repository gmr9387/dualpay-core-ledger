/**
 * Executive Reporting — operations-focused performance view.
 * Not a vanity dashboard: every tile leads back to actionable
 * workflows (denials, leak patterns, payer JOC prep).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import { detectLeakPatterns, PATTERN_LABEL } from '@/engine/leak-detection';
import { buildPayerProfiles, DIFFICULTY_CLS } from '@/engine/payer-profile';
import { Loader2, BarChart3 } from 'lucide-react';

export default function ExecutiveReporting() {
  const { data: claims, isLoading } = useClarityData();

  const data = useMemo(() => {
    if (!claims) return null;
    const billed = claims.reduce((s, c) => s + c.total_billed, 0);
    const collected = claims.reduce((s, c) => s + c.intel.actual_reimbursement_cents, 0);
    const atRisk = claims.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const appeals = claims.flatMap(c => c.intel.appeals);
    const wins = appeals.filter(a => a.status === 'approved' || a.status === 'partial');
    const decided = appeals.filter(a => ['approved','denied','partial'].includes(a.status));
    const winRate = decided.length ? wins.length / decided.length : 0;
    const recovered = appeals.reduce((s, a) => s + (a.amount_recovered_cents ?? 0), 0);
    const denials = claims.flatMap(c => c.intel.denial_events);
    const denialCats = new Map<string, number>();
    for (const d of denials) denialCats.set(d.category, (denialCats.get(d.category) ?? 0) + d.amount_cents);
    const topCats = [...denialCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const patterns = detectLeakPatterns(claims).slice(0, 5);
    const payers = buildPayerProfiles(claims).slice(0, 5);
    return { billed, collected, atRisk, recovered, winRate, topCats, patterns, payers, denialCount: denials.length, appealCount: appeals.length };
  }, [claims]);

  if (isLoading || !data) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const collectionRate = data.billed ? (data.collected / data.billed) : 0;
  const maxCat = Math.max(1, ...data.topCats.map(c => c[1]));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Executive Reporting" subtitle="Operational performance — collection, recovery, denial mix, and payer impact." />
      <KpiStrip tiles={[
        { label: 'Total Billed',     value: formatCentsCompact(data.billed) },
        { label: 'Collected',        value: formatCentsCompact(data.collected),   tone: 'amount-positive' },
        { label: 'Collection Rate',  value: `${(collectionRate * 100).toFixed(1)}%`, tone: collectionRate >= 0.92 ? 'text-status-paid' : 'text-status-pending' },
        { label: 'Revenue at Risk',  value: formatCentsCompact(data.atRisk),       tone: 'amount-negative' },
        { label: 'Recovered (Appeals)', value: formatCentsCompact(data.recovered), tone: 'amount-positive' },
        { label: 'Appeal Win Rate',  value: `${(data.winRate * 100).toFixed(0)}%`,  tone: 'text-status-cob' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Denial Mix by Category (At-Risk Dollars)">
              <div className="space-y-2.5">
                {data.topCats.map(([cat, amt]) => (
                  <div key={cat} className="grid grid-cols-[180px_1fr_120px] gap-3 items-center">
                    <span className="text-[12.5px] text-foreground">{CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}</span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-status-denied/60" style={{ width: `${(amt / maxCat) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[12.5px] text-right tabular-nums text-foreground">{formatCents(amt)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Top Leakage Patterns" action={<Link to="/leak" className="text-[11.5px] text-primary hover:underline">Open leak module</Link>}>
              <div className="divide-y -mx-4 -my-4">
                {data.patterns.map(p => (
                  <div key={p.pattern_id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-foreground">{p.title}</div>
                        <div className="text-[10.5px] text-muted-foreground font-mono">{PATTERN_LABEL[p.kind]} · {p.claim_count} claims</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[12.5px] amount-negative tabular-nums">{formatCents(p.estimated_leakage_cents)}</div>
                        <div className="text-[10.5px] amount-positive font-mono">≈{formatCents(p.recoverable_cents)} recoverable</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Payer Performance">
              <div className="space-y-2">
                {data.payers.map(p => (
                  <Link key={p.payer_id} to="/payers" className="block rounded border bg-muted/30 p-2.5 hover:bg-muted/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-medium text-foreground truncate">{p.payer_name}</span>
                      <span className={`pill border ${DIFFICULTY_CLS[p.difficulty_tier]}`}>{p.difficulty_tier}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1 text-[10.5px] font-mono text-muted-foreground">
                      <span>Coll. <b className="text-foreground">{(p.collection_rate * 100).toFixed(0)}%</b></span>
                      <span>Den. <b className="text-status-denied">{(p.denial_rate * 100).toFixed(0)}%</b></span>
                      <span>At risk <b className="amount-negative">{formatCentsCompact(p.total_at_risk_cents)}</b></span>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
            <Panel title="Operational Footprint">
              <div className="space-y-1.5 text-[12px]">
                <Row label="Open denials" value={String(data.denialCount)} />
                <Row label="Active appeals" value={String(data.appealCount)} />
                <Row label="Claims tracked" value={String(claims!.length)} />
              </div>
            </Panel>
            <div className="rounded border bg-card p-3 flex items-start gap-2.5">
              <BarChart3 className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-[11.5px] text-muted-foreground leading-snug">
                Numbers are computed live from the operational dataset.  Drill into any tile for the underlying claims and recommended actions.
              </div>
            </div>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
