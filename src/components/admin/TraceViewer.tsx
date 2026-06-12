import type { TraceObject, RuleFiring } from '@/types/trace';
import { Button } from '@/components/ui/button';
import { X, Hash, Cpu, Calculator, GitBranch, Network, Layers, History, FileSearch, MessageSquare } from 'lucide-react';

interface TraceViewerProps {
  trace: TraceObject;
  onClose: () => void;
}

const COB_CATEGORIES = new Set(['cob_primacy', 'cob_allocation']);
const WATERFALL_CATEGORIES = new Set(['pricing', 'deductible', 'coinsurance', 'copay', 'benefit_limit']);

export function TraceViewer({ trace, onClose }: TraceViewerProps) {
  const rulePath = trace.rule_firings;
  const cobFirings = rulePath.filter(r => COB_CATEGORIES.has(r.category));
  const waterfallFirings = rulePath.filter(r => WATERFALL_CATEGORIES.has(r.category));
  const accumImpacted = trace.math_steps.filter(m => m.deductible > 0 || m.coinsurance > 0 || m.copay > 0);
  const evidence = trace.source_badges ?? [];

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          Replayable Adjudication Trace
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Version pins */}
      <SectionHeader icon={<Hash className="h-3 w-3" />} title="Version Pins" subtitle="Immutable inputs for replay" />
      <div className="px-4 py-3 border-b bg-muted/10 grid grid-cols-2 gap-2">
        {[
          { label: 'Trace ID', value: trace.trace_id },
          { label: 'Run ID', value: trace.run_id },
          { label: 'Rule Set', value: trace.rule_set_version },
          { label: 'Plan', value: trace.plan_version },
          { label: 'Contract', value: trace.contract_version },
          { label: 'Calc Policy', value: trace.calc_policy_version },
          { label: 'Input Hash', value: trace.inputs_snapshot_hash },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-20">{label}:</span>
            <span className="font-mono text-[11px] text-primary truncate">{value}</span>
          </div>
        ))}
      </div>

      {/* Rule Path */}
      <SectionHeader icon={<GitBranch className="h-3 w-3" />} title="Rule Path" subtitle={`${rulePath.length} deterministic firings, in order`} />
      <div className="px-4 py-3 border-b space-y-1.5 max-h-72 overflow-y-auto">
        {rulePath.length === 0 ? <Empty label="No rule firings recorded." /> : rulePath.map((rf, i) => <RuleRow key={i} rf={rf} />)}
      </div>

      {/* Payment Waterfall */}
      <SectionHeader icon={<Layers className="h-3 w-3" />} title="Payment Waterfall" subtitle="Billed → Allowed → Cost-Share → Plan Paid" />
      <div className="px-4 py-3 border-b space-y-2">
        {trace.math_steps.length === 0 ? <Empty label="No math steps." /> : trace.math_steps.map((ms, i) => (
          <div key={i} className="bg-muted/20 rounded px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">{ms.line_id}</span>
              {ms.cob_prior_paid !== undefined && ms.cob_prior_paid > 0 && (
                <span className="status-cob text-[9px]">COB</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-1 font-mono text-[11px]">
              <Cell label="Billed" value={ms.billed} />
              <Cell label="Allowed" value={ms.allowed} />
              <Cell label="Deductible" value={ms.deductible} tone="negative" />
              <Cell label="Coinsurance" value={ms.coinsurance} tone="negative" />
              <Cell label="Copay" value={ms.copay} tone="negative" />
              <Cell label="Plan Paid" value={ms.plan_paid} tone="positive" bold />
              <Cell label="Member Resp" value={ms.member_responsibility} tone="negative" />
              {ms.cob_prior_paid !== undefined && ms.cob_prior_paid > 0 && (
                <Cell label="Prior Paid" value={ms.cob_prior_paid} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* COB Determination */}
      <SectionHeader icon={<Network className="h-3 w-3" />} title="COB Determination" subtitle="Primacy + allocation rule firings" />
      <div className="px-4 py-3 border-b space-y-1.5">
        {cobFirings.length === 0
          ? <Empty label="No coordination-of-benefits logic triggered for this run." />
          : cobFirings.map((rf, i) => <RuleRow key={i} rf={rf} />)}
      </div>

      {/* Accumulator Impact */}
      <SectionHeader icon={<Calculator className="h-3 w-3" />} title="Accumulator Impact" subtitle="Deductible / OOP movement attributable to this run" />
      <div className="px-4 py-3 border-b">
        {accumImpacted.length === 0 ? <Empty label="No accumulator movement." /> : (
          <table className="w-full text-[11.5px] font-mono">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left pb-1">Line</th><th className="text-right pb-1">Deductible</th><th className="text-right pb-1">Coinsurance</th><th className="text-right pb-1">Copay</th></tr>
            </thead>
            <tbody>
              {accumImpacted.map((ms, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="py-1">{ms.line_id}</td>
                  <td className="py-1 text-right amount-negative">${(ms.deductible/100).toFixed(2)}</td>
                  <td className="py-1 text-right amount-negative">${(ms.coinsurance/100).toFixed(2)}</td>
                  <td className="py-1 text-right amount-negative">${(ms.copay/100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Retro / Recalc Impact */}
      <SectionHeader icon={<History className="h-3 w-3" />} title="Retro / Recalc Impact" subtitle="Linked recalculation runs against this claim" />
      <div className="px-4 py-3 border-b text-[11.5px] text-muted-foreground">
        Recalc deltas surface in the linked Case panel when a retro is triggered. No recalc events embedded in this trace object.
      </div>

      {/* Evidence Used */}
      <SectionHeader icon={<FileSearch className="h-3 w-3" />} title="Evidence Used" subtitle={`${evidence.length} source badge${evidence.length !== 1 ? 's' : ''} pinned`} />
      <div className="px-4 py-3 border-b">
        {evidence.length === 0 ? <Empty label="No source badges attached to this run." /> : (
          <div className="space-y-1">
            {evidence.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_120px] gap-2 text-[11.5px]">
                <span className="font-mono text-foreground truncate" title={b.field_path}>{b.field_path}</span>
                <span className="font-mono text-muted-foreground">{b.source_type}</span>
                <span className="font-mono text-right">{Math.round(b.confidence * 100)}%</span>
                <span className="font-mono text-primary truncate text-right">{b.document_ref ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Human Review Notes Placeholder */}
      <SectionHeader icon={<MessageSquare className="h-3 w-3" />} title="Human Review Notes" subtitle="Reviewer workflow output" />
      <div className="px-4 py-3 text-[11.5px] text-muted-foreground italic">
        No reviewer notes attached. Notes captured during human review will render here alongside the deterministic trace.
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="px-4 pt-3 pb-1 flex items-baseline justify-between gap-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{title}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground/70 font-mono truncate">{subtitle}</div>}
    </div>
  );
}

function RuleRow({ rf }: { rf: RuleFiring }) {
  return (
    <div className="flex items-start gap-2 text-xs bg-muted/20 rounded px-2.5 py-2">
      <span className="font-mono text-muted-foreground w-5 text-right shrink-0">{rf.order}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-foreground">{rf.rule_id}</span>
          <span className="status-adjusted text-[9px]">{rf.category}</span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate">
          → {JSON.stringify(rf.outputs)}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, tone, bold }: { label: string; value: number; tone?: 'positive' | 'negative'; bold?: boolean }) {
  const cls = tone === 'positive' ? 'amount-positive' : tone === 'negative' ? 'amount-negative' : 'text-foreground';
  return (
    <>
      <span className="text-muted-foreground">{label}:</span>
      <span className={`${cls} ${bold ? 'font-semibold' : ''}`}>${(value / 100).toFixed(2)}</span>
    </>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-[11.5px] text-muted-foreground italic">{label}</div>;
}
