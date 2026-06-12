/**
 * Audit Readiness — checklist of artifacts an external auditor or appeals
 * reviewer would require for this adjudication run. Presentation only.
 */
import type { Claim, AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import { CheckCircle2, AlertTriangle, Circle, FileCheck } from 'lucide-react';

interface Props {
  claim: Claim;
  run: AdjudicationRun;
  trace: TraceObject;
}

type Status = 'ready' | 'partial' | 'missing';

interface Check {
  label: string;
  status: Status;
  detail: string;
}

export function AuditReadinessPanel({ claim, run, trace }: Props) {
  const hasTrace = !!trace.trace_id && trace.rule_firings.length > 0;
  const hasReasons = trace.rule_firings.length > 0;
  const cobApplicable = claim.ohi_indicators.length > 0;
  const hasCobPath = run.line_results.some(lr => lr.cob_allocations.length > 0);
  const hasWaterfall = trace.math_steps.length > 0;
  const evidenceBadges = (trace.source_badges ?? []).filter(b => !!b.document_ref).length;
  const reviewNeeded = claim.status === 'PENDED' || claim.status === 'IN_ADJUDICATION';
  const appealEligible = claim.status === 'DENIED';

  const checks: Check[] = [
    { label: 'Trace Object', status: hasTrace ? 'ready' : 'missing',
      detail: hasTrace ? `${trace.rule_firings.length} rule firings recorded` : 'No trace persisted' },
    { label: 'Decision Reasons', status: hasReasons ? 'ready' : 'missing',
      detail: hasReasons ? 'CARC/RARC rule path captured' : 'No reason codes mapped' },
    { label: 'COB Path',
      status: !cobApplicable ? 'ready' : (hasCobPath ? 'ready' : 'partial'),
      detail: !cobApplicable ? 'Not applicable — no OHI' : (hasCobPath ? 'Allocation path persisted' : 'OHI present, allocation not triggered') },
    { label: 'Payment Waterfall', status: hasWaterfall ? 'ready' : 'missing',
      detail: hasWaterfall ? `${trace.math_steps.length} math step${trace.math_steps.length !== 1 ? 's' : ''}` : 'No math steps' },
    { label: 'Evidence References',
      status: evidenceBadges > 0 ? 'ready' : (trace.source_badges?.length ? 'partial' : 'missing'),
      detail: evidenceBadges > 0 ? `${evidenceBadges} source document${evidenceBadges !== 1 ? 's' : ''} pinned` : 'No document refs attached' },
    { label: 'Human Review',
      status: reviewNeeded ? 'partial' : 'ready',
      detail: reviewNeeded ? 'Reviewer notes pending' : 'No review required for this state' },
    { label: 'Appeal Packet',
      status: appealEligible ? (hasTrace && hasReasons ? 'ready' : 'partial') : 'ready',
      detail: appealEligible
        ? (hasTrace && hasReasons ? 'Replayable trace + reasons available' : 'Missing artifacts for appeal')
        : 'Not required — claim not denied' },
  ];

  const readyCount = checks.filter(c => c.status === 'ready').length;
  const overall: Status = checks.some(c => c.status === 'missing')
    ? 'missing'
    : checks.some(c => c.status === 'partial') ? 'partial' : 'ready';

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <FileCheck className="h-3.5 w-3.5 text-primary" />
          Audit Readiness
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10.5px] font-mono text-muted-foreground">{readyCount}/{checks.length} ready</span>
          <StatusBadge status={overall} />
        </span>
      </div>
      <div className="divide-y">
        {checks.map(c => (
          <div key={c.label} className="grid grid-cols-[24px_1fr_auto] gap-3 items-center px-4 py-2 text-[12px]">
            <StatusIcon status={c.status} />
            <div className="min-w-0">
              <div className="text-foreground font-medium">{c.label}</div>
              <div className="text-[11px] text-muted-foreground truncate">{c.detail}</div>
            </div>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'ready') return <CheckCircle2 className="h-4 w-4 text-status-paid" />;
  if (status === 'partial') return <AlertTriangle className="h-4 w-4 text-status-pending" />;
  return <Circle className="h-4 w-4 text-status-denied" />;
}

function StatusBadge({ status }: { status: Status }) {
  const cls = status === 'ready' ? 'status-paid' : status === 'partial' ? 'status-pending' : 'status-denied';
  const label = status === 'ready' ? 'Ready' : status === 'partial' ? 'Partial' : 'Missing';
  return <span className={cls}>{label}</span>;
}
