import type { AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

interface StatsBarProps {
  adjResults: AdjResult[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function StatsBar({ adjResults }: StatsBarProps) {
  const totalPaid = adjResults.reduce((s, r) => s + r.run.total_plan_paid, 0);
  const totalMember = adjResults.reduce((s, r) => s + r.run.total_member_responsibility, 0);
  const totalLines = adjResults.reduce((s, r) => s + r.run.line_results.length, 0);
  const deniedLines = adjResults.reduce((s, r) => s + r.run.line_results.filter(lr => lr.status === 'denied').length, 0);
  const cobLines = adjResults.reduce((s, r) => s + r.run.line_results.filter(lr => lr.cob_allocations.length > 0).length, 0);
  const adjustedLines = adjResults.reduce((s, r) => s + r.run.line_results.filter(lr => lr.status === 'adjusted').length, 0);

  const tiles = [
    { label: 'Plan Paid (YTD)',    value: formatCents(totalPaid),  tone: 'amount-positive' },
    { label: 'Member Resp (YTD)',  value: formatCents(totalMember), tone: 'amount-negative' },
    { label: 'Lines Adjudicated',  value: `${totalLines - deniedLines} / ${totalLines}`, tone: '' },
    { label: 'Adjusted Lines',     value: String(adjustedLines), tone: 'text-status-adjusted' },
    { label: 'Denials',            value: String(deniedLines),  tone: 'text-status-denied' },
    { label: 'COB Lines',          value: String(cobLines),     tone: 'text-status-cob' },
  ];

  return (
    <div className="flex items-stretch border-b bg-card">
      {tiles.map(t => (
        <div key={t.label} className="kpi">
          <div className="kpi-label">{t.label}</div>
          <div className={`kpi-value ${t.tone}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}
