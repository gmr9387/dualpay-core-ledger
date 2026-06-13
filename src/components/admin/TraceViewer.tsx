import type { TraceObject, RuleFiring } from '@/types/trace';
import type { Claim, AdjudicationRun } from '@/types/claim';
import { Button } from '@/components/ui/button';
import {
  X, Hash, Cpu, GitBranch, Network, Layers, FileCheck, MessageSquare,
  ShieldCheck, CheckCircle2, AlertTriangle, Circle, ArrowRight, ChevronRight,
} from 'lucide-react';

interface TraceViewerProps {
  trace: TraceObject;
  onClose: () => void;
  claim?: Claim;
  run?: AdjudicationRun;
}

const COB_CATEGORIES = new Set(['cob_primacy', 'cob_allocation']);

type ReadinessStatus = 'ready' | 'partial' | 'missing';

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TraceViewer({ trace, onClose, claim, run }: TraceViewerProps) {
  const rulePath = trace.rule_firings;
  const cobFirings = rulePath.filter(r => COB_CATEGORIES.has(r.category));

  // Totals derived from trace math_steps (no recalculation; pure aggregation of existing values)
  const totals = trace.math_steps.reduce(
    (acc, ms) => ({
      billed: acc.billed + ms.billed,
      allowed: acc.allowed + ms.allowed,
      deductible: acc.deductible + ms.deductible,
      coinsurance: acc.coinsurance + ms.coinsurance,
      copay: acc.copay + ms.copay,
      planPaid: acc.planPaid + ms.plan_paid,
      memberResp: acc.memberResp + ms.member_responsibility,
      priorPaid: acc.priorPaid + (ms.cob_prior_paid ?? 0),
      cobAdj: acc.cobAdj + (ms.cob_adjustment ?? 0),
    }),
    { billed: 0, allowed: 0, deductible: 0, coinsurance: 0, copay: 0, planPaid: 0, memberResp: 0, priorPaid: 0, cobAdj: 0 },
  );

  // Adjustments total preferred from run when available, else from trace math cob_adjustment
  const adjustmentsTotal = run
    ? run.line_results.reduce((s, lr) => s + lr.adjustments.reduce((a, ad) => a + ad.amount, 0), 0)
    : totals.cobAdj;

  const hasCOB = (run?.line_results.some(lr => lr.cob_allocations.length > 0)) || cobFirings.length > 0 || totals.priorPaid > 0;
  const finalStatus = claim?.status ?? '—';

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Adjudication Audit & Review Workbench
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            Trace · {trace.trace_id.slice(0, 14)}…
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 1. EXECUTIVE DECISION SUMMARY */}
      <SectionHeader icon={<FileCheck className="h-3 w-3" />} title="Executive Decision Summary" subtitle="Adjudication outcome at a glance" />
      <div className="px-4 py-3 border-b grid grid-cols-4 gap-px bg-border rounded-none overflow-hidden">
        <Stat label="Final Status" value={finalStatus.replace(/_/g, ' ')} tone="status" />
        <Stat label="Total Billed" value={fmt(totals.billed)} />
        <Stat label="Allowed" value={fmt(totals.allowed)} />
        <Stat label="Plan Paid" value={fmt(run?.total_plan_paid ?? totals.planPaid)} tone="positive" />
        <Stat label="Member Resp." value={fmt(run?.total_member_responsibility ?? totals.memberResp)} tone="negative" />
        <Stat label="Rules Fired" value={String(rulePath.length)} />
        <Stat label="Math Steps" value={String(trace.math_steps.length)} />
        <Stat label="COB Involved" value={hasCOB ? 'Yes' : 'No'} tone={hasCOB ? 'positive' : 'muted'} />
      </div>

      {/* 2. RULE EXECUTION PATH */}
      <SectionHeader icon={<GitBranch className="h-3 w-3" />} title="Rule Execution Path" subtitle={`${rulePath.length} deterministic firings, in order`} />
      <div className="px-4 py-3 border-b">
        {rulePath.length === 0 ? <Empty label="No rule firings recorded." /> : (
          <ol className="relative">
            {rulePath.map((rf, i) => <TimelineRow key={i} rf={rf} isLast={i === rulePath.length - 1} />)}
          </ol>
        )}
      </div>

      {/* 3. PAYMENT WATERFALL */}
      <SectionHeader icon={<Layers className="h-3 w-3" />} title="Payment Waterfall" subtitle="Billed → Allowed → Cost-Share → Plan Paid" />
      <div className="px-4 py-3 border-b">
        <WaterfallChart
          steps={[
            { label: 'Billed',        value: totals.billed,      tone: 'base' },
            { label: 'Allowed',       value: totals.allowed,     tone: 'base' },
            { label: 'Deductible',    value: -totals.deductible, tone: 'negative' },
            { label: 'Coinsurance',   value: -totals.coinsurance, tone: 'negative' },
            { label: 'Copay',         value: -totals.copay,      tone: 'negative' },
            { label: 'Adjustments',   value: -adjustmentsTotal,  tone: 'negative' },
            { label: 'Plan Paid',     value: run?.total_plan_paid ?? totals.planPaid, tone: 'positive' },
            { label: 'Member Resp.',  value: run?.total_member_responsibility ?? totals.memberResp, tone: 'negative' },
          ]}
          peak={Math.max(totals.billed, 1)}
        />
      </div>

      {/* 4. COB DETERMINATION */}
      <SectionHeader icon={<Network className="h-3 w-3" />} title="Coordination of Benefits" subtitle={hasCOB ? 'COB activity detected' : 'Not applicable'} />
      <div className="px-4 py-3 border-b">
        {!hasCOB ? (
          <Empty label="No coordination of benefits activity detected." />
        ) : (
          <CobPanel claim={claim} run={run} cobFirings={cobFirings} priorPaid={totals.priorPaid} memberResp={run?.total_member_responsibility ?? totals.memberResp} />
        )}
      </div>

      {/* 5. DECISION PROVENANCE */}
      <SectionHeader icon={<Hash className="h-3 w-3" />} title="Decision Provenance" subtitle="Immutable version pins for replay" />
      <div className="px-4 py-3 border-b">
        <div className="rounded-md border bg-muted/10 divide-y">
          {[
            { label: 'Trace ID',                value: trace.trace_id },
            { label: 'Run ID',                  value: trace.run_id },
            { label: 'Rule Set Version',        value: trace.rule_set_version },
            { label: 'Plan Version',            value: trace.plan_version },
            { label: 'Contract Version',        value: trace.contract_version },
            { label: 'Calc Policy Version',     value: trace.calc_policy_version },
            { label: 'Input Snapshot Hash',     value: trace.inputs_snapshot_hash },
          ].map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[200px_1fr] gap-3 px-3 py-2 text-[12px]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
              <span className="font-mono text-primary truncate" title={value}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 6. REVIEWER NOTES */}
      <SectionHeader icon={<MessageSquare className="h-3 w-3" />} title="Reviewer Notes" subtitle="Human review workflow" />
      <div className="px-4 py-3 border-b">
        <div className="rounded-md border border-dashed bg-muted/10 px-4 py-6 text-center">
          <MessageSquare className="h-4 w-4 text-muted-foreground/60 mx-auto mb-1.5" />
          <div className="text-[12px] text-muted-foreground italic">Human reviewer notes unavailable.</div>
          <div className="text-[10.5px] text-muted-foreground/70 mt-0.5">Future-ready panel — notes from reviewer workflow will render here.</div>
        </div>
      </div>

      {/* 7. AUDIT READINESS */}
      <SectionHeader icon={<ShieldCheck className="h-3 w-3" />} title="Audit Readiness" subtitle="Compliance & replayability checklist" />
      <div className="px-4 py-3">
        <AuditChecklist trace={trace} />
      </div>
    </div>
  );
}

/* ------------------------------- subcomponents ------------------------------- */

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="px-4 pt-3 pb-1.5 flex items-baseline justify-between gap-3 bg-muted/5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-semibold">
        {icon}{title}
      </div>
      {subtitle && <div className="text-[10px] text-muted-foreground/70 font-mono truncate">{subtitle}</div>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'muted' | 'status' }) {
  const cls =
    tone === 'positive' ? 'amount-positive'
    : tone === 'negative' ? 'amount-negative'
    : tone === 'muted'    ? 'text-muted-foreground'
    : 'text-foreground';
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-[13px] font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function TimelineRow({ rf, isLast }: { rf: RuleFiring; isLast: boolean }) {
  const outputs = Object.entries(rf.outputs);
  return (
    <li className="relative pl-8 pb-3">
      {!isLast && <span className="absolute left-[11px] top-5 bottom-0 w-px bg-border" />}
      <span className="absolute left-0 top-1 h-[22px] w-[22px] rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-mono font-semibold text-primary">
        {rf.order}
      </span>
      <div className="rounded-md border bg-muted/10 px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12px] font-semibold text-foreground">{rf.rule_id}</span>
          <span className="status-adjusted text-[9px]">{rf.category}</span>
          <span className="ml-auto text-[10px] font-mono text-status-paid flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> fired
          </span>
        </div>
        {outputs.length > 0 && (
          <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px] font-mono">
            {outputs.map(([k, v]) => (
              <span key={k} className="contents">
                <span className="text-muted-foreground">{k}:</span>
                <span className="text-foreground truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

interface WaterfallStep { label: string; value: number; tone: 'base' | 'positive' | 'negative' }
function WaterfallChart({ steps, peak }: { steps: WaterfallStep[]; peak: number }) {
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const magnitude = Math.abs(s.value);
        const pct = peak > 0 ? Math.min(100, (magnitude / peak) * 100) : 0;
        const barCls =
          s.tone === 'positive' ? 'bg-status-paid'
          : s.tone === 'negative' ? 'bg-status-denied'
          : 'bg-primary/60';
        const amtCls =
          s.tone === 'positive' ? 'amount-positive'
          : s.tone === 'negative' ? 'amount-negative'
          : 'text-foreground';
        return (
          <div key={i} className="grid grid-cols-[140px_1fr_120px] items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
              <span className="font-medium text-foreground">{s.label}</span>
            </div>
            <div className="h-4 rounded bg-muted/40 overflow-hidden relative">
              <div className={`h-full ${barCls} opacity-70`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`font-mono text-[12px] text-right tabular-nums font-semibold ${amtCls}`}>
              {s.value < 0 ? `−${fmt(Math.abs(s.value))}` : fmt(s.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CobPanel({
  claim, run, cobFirings, priorPaid, memberResp,
}: { claim?: Claim; run?: AdjudicationRun; cobFirings: RuleFiring[]; priorPaid: number; memberResp: number }) {
  const ohi = claim?.ohi_indicators ?? [];
  const sorted = [...ohi].sort((a, b) => (a.primacy_order ?? 99) - (b.primacy_order ?? 99));
  const primary = sorted[0];
  const secondary = sorted[1];
  const allocations = run?.line_results.flatMap(lr => lr.cob_allocations) ?? [];
  const allocationMethod = allocations[0]?.method ?? cobFirings.find(f => f.outputs?.method)?.outputs?.method ?? '—';

  return (
    <div className="grid grid-cols-2 gap-3">
      <KvCard label="Primary Payer"      value={primary ? `${primary.payer_name} · ${primary.payer_id}` : '—'} />
      <KvCard label="Secondary Payer"    value={secondary ? `${secondary.payer_name} · ${secondary.payer_id}` : '—'} />
      <KvCard label="Prior Paid"         value={fmt(priorPaid)} tone="positive" mono />
      <KvCard label="Allocation Method"  value={String(allocationMethod)} mono />
      <KvCard label="Remaining Liability" value={fmt(memberResp)} tone="negative" mono />
      <KvCard label="COB Rule Firings"   value={String(cobFirings.length)} mono />
    </div>
  );
}

function KvCard({ label, value, tone, mono }: { label: string; value: string; tone?: 'positive' | 'negative'; mono?: boolean }) {
  const cls = tone === 'positive' ? 'amount-positive' : tone === 'negative' ? 'amount-negative' : 'text-foreground';
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12.5px] mt-0.5 truncate ${mono ? 'font-mono' : ''} ${cls}`} title={value}>{value}</div>
    </div>
  );
}

function AuditChecklist({ trace }: { trace: TraceObject }) {
  const checks: { label: string; status: ReadinessStatus; detail: string }[] = [
    { label: 'Trace Present',      status: trace.trace_id ? 'ready' : 'missing',
      detail: trace.trace_id ? 'Trace object persisted' : 'No trace id' },
    { label: 'Rules Recorded',     status: trace.rule_firings.length > 0 ? 'ready' : 'missing',
      detail: `${trace.rule_firings.length} firing${trace.rule_firings.length !== 1 ? 's' : ''} captured` },
    { label: 'Math Recorded',      status: trace.math_steps.length > 0 ? 'ready' : 'missing',
      detail: `${trace.math_steps.length} math step${trace.math_steps.length !== 1 ? 's' : ''}` },
    { label: 'Version Pins Present',
      status: (trace.rule_set_version && trace.plan_version && trace.contract_version && trace.calc_policy_version) ? 'ready'
            : (trace.rule_set_version || trace.plan_version) ? 'partial' : 'missing',
      detail: 'Rule set, plan, contract & calc policy versions' },
    { label: 'Input Hash Present', status: trace.inputs_snapshot_hash ? 'ready' : 'missing',
      detail: trace.inputs_snapshot_hash ? `Snapshot ${trace.inputs_snapshot_hash.slice(0, 16)}…` : 'No input hash' },
  ];
  const ready = checks.filter(c => c.status === 'ready').length;

  return (
    <div className="rounded-md border bg-muted/10">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Compliance Checklist</span>
        <span className="text-[10.5px] font-mono text-muted-foreground">{ready}/{checks.length} ready</span>
      </div>
      <div className="divide-y">
        {checks.map(c => (
          <div key={c.label} className="grid grid-cols-[24px_1fr_auto] gap-3 items-center px-3 py-2 text-[12px]">
            <StatusIcon status={c.status} />
            <div className="min-w-0">
              <div className="text-foreground font-medium">{c.label}</div>
              <div className="text-[10.5px] text-muted-foreground truncate">{c.detail}</div>
            </div>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'ready')   return <CheckCircle2 className="h-4 w-4 text-status-paid" />;
  if (status === 'partial') return <AlertTriangle className="h-4 w-4 text-status-pending" />;
  return <Circle className="h-4 w-4 text-status-denied" />;
}

function StatusBadge({ status }: { status: ReadinessStatus }) {
  const cls = status === 'ready' ? 'status-paid' : status === 'partial' ? 'status-pending' : 'status-denied';
  const label = status === 'ready' ? 'Ready' : status === 'partial' ? 'Partial' : 'Missing';
  return <span className={cls}>{label}</span>;
}

function Empty({ label }: { label: string }) {
  return <div className="text-[11.5px] text-muted-foreground italic">{label}</div>;
}

// Re-export for compatibility (unused symbol kept to avoid breaking imports)
export type { TraceViewerProps };
// keep ArrowRight import referenced to avoid lint noise in future revisions
void ArrowRight;
