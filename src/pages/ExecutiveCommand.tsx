/**
 * Executive Recovery Command Center — operational executive view.
 * Revenue at risk, recovered, pipeline value, denial trends, payer
 * trends, recovery efficiency.  Every tile is action-linked.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { useOutcomes } from '@/hooks/use-outcomes';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import { detectLeakPatterns, PATTERN_LABEL } from '@/engine/leak-detection';
import { buildPayerProfiles, DIFFICULTY_CLS } from '@/engine/payer-profile';
import { buildForecast } from '@/engine/forecasting';
import { Loader2, TrendingUp, Target, AlertOctagon, Gavel, Users, ArrowRight } from 'lucide-react';

export default function ExecutiveCommand() {
  const { data: claims, isLoading } = useClarityData();
  const { outcomes } = useOutcomes();


  const data = useMemo(() => {
    if (!claims) return null;
    const billed = claims.reduce((s, c) => s + c.total_billed, 0);
    const collected = claims.reduce((s, c) => s + c.intel.actual_reimbursement_cents, 0);
    const atRisk = claims.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const appeals = claims.flatMap(c => c.intel.appeals);
    const wins = appeals.filter(a => a.status === 'approved' || a.status === 'partial');
    const decided = appeals.filter(a => ['approved','denied','partial'].includes(a.status));
    const winRate = decided.length ? wins.length / decided.length : 0;
    const recovered = outcomes.reduce((s, o) => s + (o.recovered_amount_cents ?? 0), 0);
    const denials = claims.flatMap(c => c.intel.denial_events);
    const denialCats = new Map<string, number>();
    for (const d of denials) denialCats.set(d.category, (denialCats.get(d.category) ?? 0) + d.amount_cents);
    const topCats = [...denialCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const patterns = detectLeakPatterns(claims).slice(0, 4);
    const payers = buildPayerProfiles(claims).slice(0, 5);
    const fc = buildForecast(claims);
    return { billed, collected, atRisk, recovered, winRate, topCats, patterns, payers, fc, denialCount: denials.length, appealCount: appeals.length };
  }, [claims, outcomes]);

  if (isLoading || !data) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const efficiency = data.fc.total_at_risk_cents ? (data.fc.total_expected_recovery_cents / data.fc.total_at_risk_cents) : 0;
  const maxCat = Math.max(1, ...data.topCats.map(c => c[1]));

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Executive Recovery Command Center" subtitle="Operational view of revenue at risk, recovery pipeline, and team execution." />
      <KpiStrip tiles={[
        { label: 'Revenue at Risk',     value: formatCentsCompact(data.atRisk),                       tone: 'amount-negative' },
        { label: 'Recovered',           value: formatCentsCompact(data.recovered),                    tone: 'amount-positive' },
        { label: 'Pipeline Value',      value: formatCentsCompact(data.fc.total_expected_recovery_cents), tone: 'amount-positive', sub: 'forecast' },
        { label: 'Recovery Efficiency', value: `${(efficiency * 100).toFixed(0)}%`,                   tone: 'text-status-cob' },
        { label: 'Appeal Win Rate',     value: `${(data.winRate * 100).toFixed(0)}%`,                  tone: 'text-status-cob' },
        { label: 'Open Denials',        value: String(data.denialCount),                              tone: 'text-status-denied' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Denial Trends · At-Risk Dollars by Category" action={<Link to="/denials" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Denial command <ArrowRight className="h-3 w-3" /></Link>}>
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

            <Panel title="Recovery Timeline" action={<Link to="/forecast" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Forecast <ArrowRight className="h-3 w-3" /></Link>}>
              <div className="space-y-2">
                {data.fc.buckets.map(b => {
                  const max = Math.max(1, ...data.fc.buckets.map(x => x.expected_recovery_cents));
                  return (
                    <div key={b.label} className="grid grid-cols-[160px_1fr_120px] gap-3 items-center text-[12px]">
                      <span className="text-foreground">{b.label}</span>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-status-paid/60" style={{ width: `${(b.expected_recovery_cents / max) * 100}%` }} />
                      </div>
                      <span className="font-mono text-right tabular-nums amount-positive">{formatCents(b.expected_recovery_cents)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Top Leakage Patterns" action={<Link to="/leak" className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Leak module <ArrowRight className="h-3 w-3" /></Link>}>
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
            <Panel title="Payer Trends" action={<Link to="/payers" className="text-[11.5px] text-primary hover:underline">Open</Link>}>
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
                      <span>Risk <b className="amount-negative">{formatCentsCompact(p.total_at_risk_cents)}</b></span>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="Operational Footprint">
              <div className="space-y-1.5 text-[12px]">
                <Row icon={<AlertOctagon className="h-3.5 w-3.5 text-status-denied" />} label="Open denials"    value={String(data.denialCount)} link="/denials" />
                <Row icon={<Gavel className="h-3.5 w-3.5 text-status-cob" />}            label="Active appeals"  value={String(data.appealCount)} link="/appeals" />
                <Row icon={<Target className="h-3.5 w-3.5 text-primary" />}              label="Pipeline value"  value={formatCentsCompact(data.fc.total_expected_recovery_cents)} link="/pipeline" />
                <Row icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}      label="Team workload"   value={`${Math.round(data.fc.workload_minutes_total / 60)}h`} link="/team" />
                <Row icon={<TrendingUp className="h-3.5 w-3.5 text-status-paid" />}      label="Monthly proj."   value={formatCentsCompact(data.fc.monthly_projection_cents)} link="/forecast" />
              </div>
            </Panel>

            <div className="rounded border bg-card p-3 text-[11.5px] text-muted-foreground">
              <span className="font-semibold text-foreground">Action-first reporting.</span> Every tile links to the operational module where the work happens.
            </div>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ icon, label, value, link }: { icon?: React.ReactNode; label: string; value: string; link?: string }) {
  const inner = (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
  return link ? <Link to={link} className="block hover:bg-muted/40 -mx-1 px-1 py-0.5 rounded">{inner}</Link> : inner;
}
