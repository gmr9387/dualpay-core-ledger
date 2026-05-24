/**
 * Transparency UI primitives — render explainable scores, factor
 * breakdowns, evidence checklists, and "Insufficient Evidence" surfaces.
 */
import { ReactNode } from 'react';
import { AlertTriangle, Check, X, MinusCircle, FileQuestion, TrendingUp, TrendingDown } from 'lucide-react';
import { READINESS_CLS, READINESS_LABEL, ReadinessTier } from '@/engine/evidence-readiness';
import type { SufficiencyCheck } from '@/engine/sufficiency';

export function ReadinessBadge({ tier }: { tier: ReadinessTier }) {
  return (
    <span className={`pill border ${READINESS_CLS[tier]}`}>{READINESS_LABEL[tier]}</span>
  );
}

export function FactorRow({
  label, detail, delta, weight, status,
}: {
  label: string; detail: string;
  delta?: number; weight?: string;
  status?: 'pass' | 'warn' | 'fail' | 'unknown';
}) {
  const statusIcon =
    status === 'pass' ? <Check className="h-3 w-3 text-status-paid" />
    : status === 'fail' ? <X className="h-3 w-3 text-status-denied" />
    : status === 'warn' ? <AlertTriangle className="h-3 w-3 text-status-pending" />
    : status === 'unknown' ? <MinusCircle className="h-3 w-3 text-muted-foreground" />
    : null;

  return (
    <div className="grid grid-cols-[150px_1fr_70px] gap-3 items-start text-[12px] py-1.5 border-b last:border-b-0 border-border/60">
      <div className="flex items-center gap-1.5">
        {statusIcon}
        <div>
          <div className="text-foreground font-medium">{label}</div>
          {weight && <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{weight}</div>}
        </div>
      </div>
      <div className="text-muted-foreground text-[11.5px] leading-snug">{detail}</div>
      {typeof delta === 'number' && (
        <div className={`text-right font-mono tabular-nums text-[12px] flex items-center justify-end gap-1 ${
          delta > 0 ? 'amount-positive' : delta < 0 ? 'amount-negative' : 'text-muted-foreground'
        }`}>
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {delta > 0 ? `+${delta}` : delta}
        </div>
      )}
    </div>
  );
}

export function EvidenceChecklist({
  items,
}: { items: Array<{ label: string; present: boolean; source: string; blocking?: boolean }> }) {
  if (items.length === 0) return <div className="text-[12px] text-muted-foreground italic">No requirements identified.</div>;
  return (
    <ul className="divide-y -mx-1">
      {items.map((it, i) => (
        <li key={i} className="px-1 py-1.5 flex items-start gap-2 text-[12px]">
          {it.present
            ? <Check className="h-3.5 w-3.5 text-status-paid mt-0.5 shrink-0" />
            : <X className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${it.blocking ? 'text-status-denied' : 'text-status-pending'}`} />}
          <div className="flex-1 min-w-0">
            <div className={it.present ? 'text-foreground' : 'text-foreground font-medium'}>{it.label}</div>
            <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
              {it.source.replace(/_/g, ' ')}{it.blocking ? ' · blocking' : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function InsufficientEvidence({
  title = 'Insufficient Evidence',
  check,
  body,
}: { title?: string; check?: SufficiencyCheck; body?: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
          <FileQuestion className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {body ?? 'Not enough source data to produce a deterministic result. No fabricated score will be shown.'}
          </div>
          {check && (
            <>
              {check.missing_elements.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Missing data elements</div>
                  <ul className="space-y-0.5 text-[11.5px]">
                    {check.missing_elements.map(e => (
                      <li key={e} className="flex items-start gap-1.5 text-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-denied mt-1.5 shrink-0" />
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {check.required_actions.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Required actions</div>
                  <ul className="space-y-0.5 text-[11.5px]">
                    {check.required_actions.map(a => (
                      <li key={a} className="flex items-start gap-1.5 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CalculationBreakdown({
  steps,
}: { steps: Array<{ label: string; value: string; mono?: boolean }> }) {
  return (
    <div className="rounded border bg-muted/30 p-2.5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">How this was calculated</div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center justify-between text-[11.5px]">
          <span className="text-muted-foreground">{s.label}</span>
          <span className={`${s.mono ? 'font-mono tabular-nums' : ''} text-foreground`}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{children}</div>;
}

export function BasisList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-[11.5px] text-muted-foreground">
      {items.map((b, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}
