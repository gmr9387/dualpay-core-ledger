/**
 * Recovery Intelligence — Phase 5 executive dashboard.
 *
 * Proves whether the intelligence is working: shows how much
 * money was actually recovered, which categories / payers /
 * playbooks perform best, and how well predicted recoverability
 * matches reality.  Every tile is derived from the RecoveryOutcome
 * log; groups with fewer than MIN_SAMPLE outcomes render an
 * "Insufficient Outcome History" treatment.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Award, AlertTriangle, Clock, Target, ArrowRight, Info, BookOpen, Building2, Layers, ClipboardList } from 'lucide-react';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useOutcomes } from '@/hooks/use-outcomes';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { explainRecoverability } from '@/engine/recoverability';
import {
  headlineMetrics, recoveryByCategory, recoveryByPayer, recoveryByPlaybook,
  recoveryByOwner, calibration, topN, MIN_SAMPLE, CATEGORY_LABEL,
  type GroupStat,
} from '@/engine/outcome-analytics';

export default function RecoveryIntelligence() {
  const { outcomes, loading } = useOutcomes();
  const { data: claims } = useClarityData();

  const m = useMemo(() => outcomes && headlineMetrics(outcomes), [outcomes]);
  const cats = useMemo(() => recoveryByCategory(outcomes), [outcomes]);
  const payers = useMemo(() => recoveryByPayer(outcomes), [outcomes]);
  const playbooks = useMemo(() => recoveryByPlaybook(outcomes), [outcomes]);
  const owners = useMemo(() => recoveryByOwner(outcomes), [outcomes]);
  const cal = useMemo(() => calibration(outcomes), [outcomes]);

  // Forecast — derived from open claims' recoverability scores
  const forecast = useMemo(() => {
    if (!claims) return null;
    const open = claims.filter(c => c.intel.amount_at_risk_cents > 0);
    let exp30 = 0, exp90 = 0, expMonth = 0, openRecoverable = 0;
    const opps: Array<{ id: string; score: number; at_risk: number; expected: number; payer: string }> = [];
    const monthStart = new Date(); monthStart.setUTCDate(1);
    const in30 = new Date(); in30.setUTCDate(in30.getUTCDate() + 30);
    const in90 = new Date(); in90.setUTCDate(in90.getUTCDate() + 90);
    for (const c of open) {
      const score = explainRecoverability(c).score;
      const expected = Math.round(c.intel.amount_at_risk_cents * score / 100);
      openRecoverable += expected;
      const due = new Date(c.intel.sla_due_at);
      if (due <= in30) exp30 += expected;
      if (due <= in90) exp90 += expected;
      // Month projection: claims with SLA in current calendar month
      if (due.getUTCMonth() === monthStart.getUTCMonth() && due.getUTCFullYear() === monthStart.getUTCFullYear()) {
        expMonth += expected;
      }
      opps.push({ id: c.claim_id, score, at_risk: c.intel.amount_at_risk_cents, expected, payer: c.intel.payer_name });
    }
    opps.sort((a, b) => b.expected - a.expected);
    return { exp30, exp90, expMonth, openRecoverable, opps: opps.slice(0, 8), open: open.length };
  }, [claims]);

  if (loading || !m || !forecast) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  }

  if (m.insufficient && outcomes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Recovery Intelligence" subtitle="Outcome learning across payers, categories, playbooks, and teams." />
        <div className="flex-1 flex items-center justify-center p-10">
          <InsufficientCard title="Insufficient Outcome History" body="Log resolved denials in the Outcome Log to begin measuring recovery performance." cta />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Recovery Intelligence"
        subtitle="Outcome learning — measured recovery performance across categories, payers, playbooks, and teams."
        actions={
          <Link to="/outcomes" className="text-[12px] px-3 h-8 inline-flex items-center gap-1.5 rounded-md border bg-card hover:bg-muted">
            <ClipboardList className="h-3.5 w-3.5" /> Outcome Log
          </Link>
        }
      />
      <KpiStrip tiles={[
        { label: 'Total Denied (logged)',  value: formatCentsCompact(m.total_denied_cents) },
        { label: 'Total Recovered',         value: formatCentsCompact(m.total_recovered_cents), tone: 'amount-positive' },
        { label: 'Recovery Rate',           value: pct(m.recovery_rate),                         tone: rrTone(m.recovery_rate) },
        { label: 'Appeal Success Rate',     value: pct(m.appeal_success_rate),                   tone: 'text-status-cob' },
        { label: 'Avg Days to Resolution',  value: `${m.avg_days_to_resolution.toFixed(0)}d` },
        { label: 'Outcomes Tracked',        value: String(m.outcome_count) },
      ]} />

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          {/* ── Recovery Performance + Calibration ────────────────────── */}
          <div className="col-span-2 space-y-4">
            <Panel title="Recovery by Category" action={<MethodNote text={`Recovered $ ÷ Denied $ per denial category. Derived from ${outcomes.length} logged outcomes.`} />}>
              <RankList rows={cats.slice(0, 8)} mode="rate" linkBase="/denials" />
            </Panel>

            <Panel title="Playbook Effectiveness" action={<MethodNote text="Recovery rate per playbook used. Underperformers may need revision; top performers should be defaulted." />}>
              <div className="grid grid-cols-2 gap-3">
                <Subpanel icon={<Award className="h-3.5 w-3.5 text-status-paid" />} title="Top Performing">
                  <RankList rows={topN(playbooks, 4, 'recovery_rate', 'desc')} mode="rate" compact />
                </Subpanel>
                <Subpanel icon={<AlertTriangle className="h-3.5 w-3.5 text-status-denied" />} title="Underperforming">
                  <RankList rows={topN(playbooks, 4, 'recovery_rate', 'asc')} mode="rate" compact />
                </Subpanel>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-1.5">
                <BookOpen className="h-3 w-3" /> {playbooks.length} playbooks observed · groups with &lt;{MIN_SAMPLE} outcomes excluded from rankings.
              </div>
            </Panel>

            <Panel title="Prediction Calibration — Recoverability Score vs Actual Recovery"
              action={<MethodNote text="Outcomes are bucketed by the recoverability score predicted at denial. The actual recovery rate per band reveals whether the model is well-calibrated." />}>
              {cal.insufficient ? (
                <InsufficientInline body="At least 5 logged outcomes are required to assess calibration." />
              ) : (
                <CalibrationTable cal={cal} />
              )}
            </Panel>
          </div>

          {/* ── Right column: payers, owners, forecast ──────────────── */}
          <div className="space-y-4">
            <Panel title="Payer Intelligence" action={<Link to="/payers" className="text-[11.5px] text-primary hover:underline">Open module</Link>}>
              <Subpanel icon={<Award className="h-3.5 w-3.5 text-status-paid" />} title="Best Payers (recovery rate)" compact>
                <RankList rows={topN(payers, 3, 'recovery_rate', 'desc')} mode="rate" compact />
              </Subpanel>
              <Subpanel icon={<AlertTriangle className="h-3.5 w-3.5 text-status-denied" />} title="Worst Payers" compact>
                <RankList rows={topN(payers, 3, 'recovery_rate', 'asc')} mode="rate" compact />
              </Subpanel>
              <Subpanel icon={<Clock className="h-3.5 w-3.5 text-status-pending" />} title="Slowest Resolution" compact>
                <RankList rows={topN(payers, 3, 'avg_days_to_resolution', 'desc')} mode="days" compact />
              </Subpanel>
            </Panel>

            <Panel title="Team Performance" action={<Link to="/team" className="text-[11.5px] text-primary hover:underline">Team Ops</Link>}>
              <RankList rows={owners.slice(0, 6)} mode="rate" compact />
            </Panel>

            <Panel title="Recovery Forecast" action={<MethodNote text="Recoverability score × open at-risk amount per claim, bucketed by SLA due date." />}>
              <div className="space-y-1.5 text-[12px]">
                <Row label="Expected this month"      value={formatCents(forecast.expMonth)} mono />
                <Row label="Expected next 30 days"    value={formatCents(forecast.exp30)} mono />
                <Row label="Expected next 90 days"    value={formatCents(forecast.exp90)} mono />
                <Row label="Open recoverable $"       value={formatCents(forecast.openRecoverable)} mono strong />
                <Row label="Open denied claims"       value={String(forecast.open)} mono />
              </div>
            </Panel>

            <Panel title="Top Recovery Opportunities" action={<Link to="/today" className="text-[11.5px] text-primary hover:underline">Worklist</Link>}>
              <div className="space-y-1.5">
                {forecast.opps.map(o => (
                  <Link key={o.id} to={`/denials/${o.id}`} className="block rounded border bg-muted/30 p-2 hover:bg-muted/60">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11.5px] text-foreground">{o.id}</span>
                      <span className="font-mono text-[11.5px] amount-positive tabular-nums">{formatCentsCompact(o.expected)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-[10.5px] text-muted-foreground">
                      <span className="truncate pr-2">{o.payer}</span>
                      <span className="font-mono">score {o.score} · at risk {formatCentsCompact(o.at_risk)}</span>
                    </div>
                  </Link>
                ))}
                {forecast.opps.length === 0 && <InsufficientInline body="No open recoverable claims." />}
              </div>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

// ────── helpers ──────

function pct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function rrTone(r: number): string {
  if (r >= 0.7) return 'amount-positive';
  if (r >= 0.4) return 'text-status-pending';
  return 'amount-negative';
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? 'font-mono tabular-nums' : ''} ${strong ? 'text-foreground font-semibold' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function Subpanel({ icon, title, children, compact }: { icon?: React.ReactNode; title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? 'mb-2.5' : ''}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function RankList({ rows, mode, compact, linkBase }: { rows: GroupStat[]; mode: 'rate' | 'days'; compact?: boolean; linkBase?: string }) {
  if (rows.length === 0) return <InsufficientInline body="No data yet." />;
  const max = Math.max(1, ...rows.map(r => mode === 'rate' ? r.recovery_rate * 100 : r.avg_days_to_resolution));
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {rows.map(r => {
        const v = mode === 'rate' ? r.recovery_rate * 100 : r.avg_days_to_resolution;
        const tone = mode === 'rate'
          ? (r.recovery_rate >= 0.6 ? 'bg-status-paid/60' : r.recovery_rate >= 0.35 ? 'bg-status-pending/60' : 'bg-status-denied/60')
          : 'bg-status-pending/50';
        return (
          <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] truncate ${r.insufficient ? 'text-muted-foreground' : 'text-foreground'}`}>{r.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">n={r.count}</span>
              </div>
              <div className="h-1.5 mt-0.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${tone}`} style={{ width: r.insufficient ? '0%' : `${(v / max) * 100}%` }} />
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              {r.insufficient ? (
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">insufficient</span>
              ) : (
                <span className="font-mono text-[12px] tabular-nums text-foreground">
                  {mode === 'rate' ? `${(r.recovery_rate * 100).toFixed(0)}%` : `${r.avg_days_to_resolution.toFixed(0)}d`}
                </span>
              )}
              {!r.insufficient && (
                <div className="font-mono text-[10.5px] amount-positive tabular-nums">{formatCentsCompact(r.total_recovered_cents)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalibrationTable({ cal }: { cal: ReturnType<typeof calibration> }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Prediction Accuracy" value={pct(cal.overall_prediction_accuracy)} tone={cal.overall_prediction_accuracy > 0.75 ? 'amount-positive' : cal.overall_prediction_accuracy > 0.5 ? 'text-status-pending' : 'amount-negative'} />
        <Stat label="False Positive Rate" value={pct(cal.false_positive_rate)} tone="text-status-denied" sub="High score · low recovery" />
        <Stat label="False Negative Rate" value={pct(cal.false_negative_rate)} tone="text-status-pending" sub="Low score · high recovery" />
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground border-b">
            <th className="text-left py-1.5 pr-2 font-semibold">Score Band</th>
            <th className="text-right px-2 font-semibold">Expected</th>
            <th className="text-right px-2 font-semibold">Actual</th>
            <th className="text-right px-2 font-semibold">Delta</th>
            <th className="text-right py-1.5 pl-2 font-semibold">n</th>
          </tr>
        </thead>
        <tbody>
          {cal.bands.map(b => (
            <tr key={b.band} className="border-b last:border-0">
              <td className="py-1.5 pr-2 font-mono text-foreground">{b.band}</td>
              <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">{pct(b.expected_midpoint)}</td>
              <td className="px-2 text-right font-mono tabular-nums">
                {b.insufficient ? <span className="text-[10px] uppercase text-muted-foreground">n/a</span> : pct(b.actual_recovery_rate)}
              </td>
              <td className={`px-2 text-right font-mono tabular-nums ${b.insufficient ? 'text-muted-foreground' : b.calibration_delta >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                {b.insufficient ? '—' : `${b.calibration_delta >= 0 ? '+' : ''}${(b.calibration_delta * 100).toFixed(1)}pp`}
              </td>
              <td className="py-1.5 pl-2 text-right font-mono tabular-nums text-muted-foreground">{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${tone ?? 'text-foreground'}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function MethodNote({ text }: { text: string }) {
  return (
    <span title={text} className="text-[10.5px] font-mono text-muted-foreground hover:text-foreground cursor-help inline-flex items-center gap-1">
      <Info className="h-3 w-3" /> method
    </span>
  );
}

function InsufficientInline({ body }: { body: string }) {
  return (
    <div className="rounded border border-dashed bg-muted/30 px-3 py-3 text-[11.5px] text-muted-foreground flex items-start gap-2">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span><b className="text-foreground">Insufficient Outcome History.</b> {body}</span>
    </div>
  );
}

function InsufficientCard({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <div className="max-w-md text-center rounded-lg border-2 border-dashed bg-card p-8">
      <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-[12.5px] text-muted-foreground mt-2">{body}</p>
      {cta && (
        <Link to="/outcomes" className="inline-flex items-center gap-1.5 mt-4 px-3 h-8 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90">
          Open Outcome Log <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
