import type { AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import { DollarSign, FileCheck, AlertTriangle, ArrowRightLeft } from 'lucide-react';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

interface StatsBarProps {
  adjResults: AdjResult[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function StatsBar({ adjResults }: StatsBarProps) {
  const totalPaid = adjResults.reduce((s, r) => s + r.run.total_plan_paid, 0);
  const totalMember = adjResults.reduce((s, r) => s + r.run.total_member_responsibility, 0);
  const totalLines = adjResults.reduce((s, r) => s + r.run.line_results.length, 0);
  const deniedLines = adjResults.reduce((s, r) => s + r.run.line_results.filter(lr => lr.status === 'denied').length, 0);
  const cobLines = adjResults.reduce((s, r) => s + r.run.line_results.filter(lr => lr.cob_allocations.length > 0).length, 0);

  const stats = [
    { icon: DollarSign, label: 'Plan Paid', value: formatCents(totalPaid), colorClass: 'text-status-paid' },
    { icon: DollarSign, label: 'Member Resp', value: formatCents(totalMember), colorClass: 'text-status-denied' },
    { icon: FileCheck, label: 'Lines Processed', value: `${totalLines - deniedLines}/${totalLines}`, colorClass: 'text-primary' },
    { icon: AlertTriangle, label: 'Denials', value: String(deniedLines), colorClass: 'text-status-denied' },
    { icon: ArrowRightLeft, label: 'COB Lines', value: String(cobLines), colorClass: 'text-status-cob' },
  ];

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 border-b bg-muted/20">
      {stats.map(({ icon: Icon, label, value, colorClass }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
