import type { Claim } from '@/types/claim';
import type { AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import { FileText, AlertTriangle, CheckCircle, ArrowRightLeft } from 'lucide-react';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

interface ClaimListProps {
  claims: Claim[];
  adjResults: AdjResult[];
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'PAID': case 'ADJUDICATED': return 'status-paid';
    case 'DENIED': return 'status-denied';
    case 'COB_ROUTED': case 'AWAITING_PRIMARY_EOB': return 'status-cob';
    case 'PENDED': case 'IN_ADJUDICATION': return 'status-pending';
    default: return 'status-adjusted';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PAID': case 'ADJUDICATED': return <CheckCircle className="h-3.5 w-3.5" />;
    case 'DENIED': return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'COB_ROUTED': return <ArrowRightLeft className="h-3.5 w-3.5" />;
    default: return <FileText className="h-3.5 w-3.5" />;
  }
}

export function ClaimList({ claims, adjResults, selectedClaimId, onSelect }: ClaimListProps) {
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold text-foreground">Claims Queue</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{claims.length} claims loaded</p>
      </div>
      {claims.map(claim => {
        const adj = adjResults.find(r => r.claimId === claim.claim_id);
        const isSelected = claim.claim_id === selectedClaimId;
        const hasCOB = claim.ohi_indicators.length > 0;

        return (
          <button
            key={claim.claim_id}
            onClick={() => onSelect(claim.claim_id)}
            className={`w-full text-left px-4 py-3 border-b transition-colors ${
              isSelected
                ? 'bg-secondary border-l-2 border-l-primary'
                : 'hover:bg-muted/50 border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-sm font-semibold text-foreground">{claim.claim_id}</span>
              <span className={getStatusClass(claim.status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(claim.status)}
                  {claim.status.replace(/_/g, ' ')}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{claim.provider_name}</span>
              <span className="font-mono">{claim.member_id}</span>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground">
                {claim.service_date_from} · {claim.lines.length} line{claim.lines.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {hasCOB && (
                  <span className="status-cob text-[10px]">COB</span>
                )}
                <span className="font-mono text-sm font-medium text-foreground">
                  {formatCents(claim.total_billed)}
                </span>
              </div>
            </div>
            {adj && (
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan Paid</div>
                  <div className="font-mono text-xs amount-positive">{formatCents(adj.run.total_plan_paid)}</div>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Member Resp</div>
                  <div className="font-mono text-xs amount-negative">{formatCents(adj.run.total_member_responsibility)}</div>
                </div>
                <div className="flex-1 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trace</div>
                  <div className="font-mono text-[10px] text-primary truncate">{adj.trace.trace_id.slice(0, 12)}…</div>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
