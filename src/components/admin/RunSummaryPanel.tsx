/**
 * Adjudication Run Summary — executive panel summarising the final
 * decision for a single adjudication run. Presentation only.
 */
import type { Claim, AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import { ShieldCheck, Coins, Users, AlertTriangle } from 'lucide-react';

interface Props {
  claim: Claim;
  run: AdjudicationRun;
  trace: TraceObject;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function decisionFor(claim: Claim, run: AdjudicationRun): { label: string; tone: string } {
  const allDenied = run.line_results.length > 0 && run.line_results.every(lr => lr.status === 'denied');
  const anyDenied = run.line_results.some(lr => lr.status === 'denied');
  if (claim.status === 'DENIED' || allDenied) return { label: 'Denied', tone: 'status-denied' };
  if (claim.status === 'PAID' || claim.status === 'ADJUDICATED') {
    return { label: anyDenied ? 'Partially Paid' : 'Approved', tone: anyDenied ? 'status-adjusted' : 'status-paid' };
  }
  if (claim.status === 'COB_ROUTED' || claim.status === 'AWAITING_PRIMARY_EOB') {
    return { label: 'Awaiting Coordination', tone: 'status-cob' };
  }
  return { label: 'In Adjudication', tone: 'status-pending' };
}

export function RunSummaryPanel({ claim, run, trace }: Props) {
  const ordered = [...claim.ohi_indicators].sort(
    (a, b) => (a.primacy_order ?? 99) - (b.primacy_order ?? 99),
  );
  const primary = ordered[0]?.payer_name ?? 'This Plan (Primary)';
  const secondary = ordered[1]?.payer_name ?? '—';

  const decision = decisionFor(claim, run);
  const deniedAmount = run.line_results
    .filter(lr => lr.status === 'denied')
    .reduce((s, lr) => s + lr.allowed, 0);

  const cobLines = run.line_results.filter(lr => lr.cob_allocations.length > 0).length;
  const cobResult = cobLines === 0
    ? (claim.ohi_indicators.length > 0 ? 'OHI present — no allocation triggered' : 'No COB applicable')
    : `${cobLines} line${cobLines !== 1 ? 's' : ''} coordinated across ${claim.ohi_indicators.length || 1} payer${claim.ohi_indicators.length > 1 ? 's' : ''}`;

  const badges = trace.source_badges ?? [];
  const avgConfidence = badges.length === 0
    ? null
    : Math.round((badges.reduce((s, b) => s + b.confidence, 0) / badges.length) * 100);

  const reviewState = claim.status === 'PENDED' || claim.status === 'IN_ADJUDICATION'
    ? 'Awaiting reviewer'
    : claim.status === 'DENIED'
      ? 'Reviewer decision recorded'
      : 'No review required';

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Adjudication Run Summary
        </span>
        <span className={decision.tone}>{decision.label}</span>
      </div>
      <div className="p-4 grid grid-cols-4 gap-4 text-[12px]">
        <Stat icon={<Coins className="h-3.5 w-3.5" />} label="Plan Paid" value={fmt(run.total_plan_paid)} tone="amount-positive" />
        <Stat icon={<Coins className="h-3.5 w-3.5" />} label="Patient Responsibility" value={fmt(run.total_member_responsibility)} tone="amount-negative" />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Denied Allowed" value={fmt(deniedAmount)} tone={deniedAmount > 0 ? 'amount-negative' : 'text-muted-foreground'} />
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Confidence" value={avgConfidence === null ? 'Insufficient signals' : `${avgConfidence}%`} tone={avgConfidence !== null && avgConfidence >= 80 ? 'amount-positive' : 'text-foreground'} />

        <KV label="Primary Payer" value={primary} />
        <KV label="Secondary Payer" value={secondary} />
        <KV label="COB Result" value={cobResult} />
        <KV label="Review State" value={reviewState} />
      </div>
    </section>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`font-mono text-[14px] font-semibold tabular-nums mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[12.5px] text-foreground truncate" title={value}>{value}</div>
    </div>
  );
}
