/**
 * Claim Operations dashboard KPIs — enterprise-grade summary across the
 * Claim Clarity adjudication queue. Presentation only; derives from the
 * existing AdjudicationRun + Claim shapes without altering engine output.
 */
import type { Claim, AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import type { Case } from '@/types/case';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

interface Props {
  claims: Claim[];
  adjResults: AdjResult[];
  cases: Case[];
}

interface Tile {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}

export function ClaimOperationsKpis({ claims, adjResults, cases }: Props) {
  const total = claims.length;
  const linkedCaseIds = new Set<string>();
  for (const c of claims) {
    if (c.case_id) linkedCaseIds.add(c.case_id);
  }
  for (const k of cases) {
    if (k.claim_ids.some(id => claims.find(c => c.claim_id === id))) linkedCaseIds.add(k.case_id);
  }

  const autoAdjudicated = adjResults.filter(r => {
    const claim = claims.find(c => c.claim_id === r.claimId);
    if (!claim) return false;
    if (claim.status !== 'PAID' && claim.status !== 'ADJUDICATED') return false;
    return r.run.line_results.every(lr => lr.status !== 'denied');
  }).length;

  const needsReview = claims.filter(c =>
    c.status === 'PENDED' || c.status === 'IN_ADJUDICATION' || c.status === 'AWAITING_PRIMARY_EOB',
  ).length;

  const cobConflicts = adjResults.filter(r =>
    r.run.line_results.some(lr => lr.cob_allocations.length > 0),
  ).length;

  const appealReady = claims.filter(c => {
    if (c.status !== 'DENIED') return false;
    const r = adjResults.find(x => x.claimId === c.claim_id);
    return !!r && r.trace.rule_firings.length > 0 && r.trace.math_steps.length > 0;
  }).length;

  const traceCoverage = total === 0 ? 0 : Math.round((adjResults.length / total) * 100);

  const tiles: Tile[] = [
    { label: 'Claims Processed', value: total.toLocaleString() },
    { label: 'Cases Linked', value: linkedCaseIds.size.toLocaleString(), sub: 'N→1 case grouping' },
    { label: 'Auto-Adjudicated', value: autoAdjudicated.toLocaleString(), tone: 'amount-positive' },
    { label: 'Needs Review', value: needsReview.toLocaleString(), tone: needsReview ? 'text-status-pending' : '' },
    { label: 'COB Conflicts', value: cobConflicts.toLocaleString(), tone: cobConflicts ? 'text-status-cob' : '' },
    { label: 'Appeal-Ready', value: appealReady.toLocaleString(), tone: appealReady ? 'text-status-denied' : '' },
    { label: 'Avg Processing', value: 'Insufficient History', sub: 'awaiting volume' },
    { label: 'Trace Coverage', value: `${traceCoverage}%`, tone: traceCoverage === 100 ? 'amount-positive' : '', sub: 'replayable decisions' },
  ];

  return (
    <div className="flex items-stretch border-b bg-card">
      {tiles.map(t => (
        <div key={t.label} className="kpi flex-1">
          <div className="kpi-label">{t.label}</div>
          <div className={`kpi-value ${t.tone ?? ''}`}>{t.value}</div>
          {t.sub && <div className="text-[10.5px] font-mono text-muted-foreground/80 mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
