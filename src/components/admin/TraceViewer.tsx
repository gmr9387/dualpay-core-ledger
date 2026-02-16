import type { TraceObject } from '@/types/trace';
import { Button } from '@/components/ui/button';
import { X, Hash, Cpu, Calculator, Shield } from 'lucide-react';

interface TraceViewerProps {
  trace: TraceObject;
  onClose: () => void;
}

export function TraceViewer({ trace, onClose }: TraceViewerProps) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          Adjudication Trace
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Version Pins */}
      <div className="px-4 py-3 border-b bg-muted/10">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Version Pins</div>
        <div className="grid grid-cols-2 gap-2">
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
      </div>

      {/* Rule Firings */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          <Hash className="h-3 w-3" />
          Rule Firings ({trace.rule_firings.length})
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {trace.rule_firings.map((rf, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-muted/20 rounded px-2.5 py-2">
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
          ))}
        </div>
      </div>

      {/* Math Steps */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          <Calculator className="h-3 w-3" />
          Math Steps ({trace.math_steps.length})
        </div>
        <div className="space-y-2">
          {trace.math_steps.map((ms, i) => (
            <div key={i} className="bg-muted/20 rounded px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-xs font-semibold text-foreground">{ms.line_id}</span>
                {ms.cob_prior_paid !== undefined && ms.cob_prior_paid > 0 && (
                  <span className="status-cob text-[9px]">COB</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-x-4 gap-y-1 font-mono text-[11px]">
                <span className="text-muted-foreground">Billed:</span>
                <span className="text-foreground">${(ms.billed / 100).toFixed(2)}</span>
                <span className="text-muted-foreground">Allowed:</span>
                <span className="text-foreground">${(ms.allowed / 100).toFixed(2)}</span>
                <span className="text-muted-foreground">Deductible:</span>
                <span className="amount-negative">${(ms.deductible / 100).toFixed(2)}</span>
                <span className="text-muted-foreground">Coinsurance:</span>
                <span className="amount-negative">${(ms.coinsurance / 100).toFixed(2)}</span>
                <span className="text-muted-foreground">Plan Paid:</span>
                <span className="amount-positive font-semibold">${(ms.plan_paid / 100).toFixed(2)}</span>
                <span className="text-muted-foreground">Member:</span>
                <span className="amount-negative">${(ms.member_responsibility / 100).toFixed(2)}</span>
                {ms.cob_prior_paid !== undefined && ms.cob_prior_paid > 0 && (
                  <>
                    <span className="text-muted-foreground">Prior Paid:</span>
                    <span className="text-foreground">${(ms.cob_prior_paid / 100).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
