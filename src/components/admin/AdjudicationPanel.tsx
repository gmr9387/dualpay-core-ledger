import type { Claim, AdjudicationRun } from '@/types/claim';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, FileCode2, ArrowRight } from 'lucide-react';

interface AdjudicationPanelProps {
  claim: Claim;
  run: AdjudicationRun;
  onShowTrace: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AdjudicationPanel({ claim, run, onShowTrace }: AdjudicationPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">{claim.claim_id}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {claim.provider_name} · {claim.facility_name ?? 'N/A'} · NPI {claim.provider_npi}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Member: <span className="font-mono text-foreground">{claim.member_id}</span></span>
            <span>Service: <span className="font-mono text-foreground">{claim.service_date_from}</span></span>
            <span>Run: <span className="font-mono text-primary">{run.run_id.slice(0, 16)}…</span></span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onShowTrace} className="gap-1.5">
          <FileCode2 className="h-3.5 w-3.5" />
          View Trace
        </Button>
      </div>

      {/* Line Results Table */}
      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Line</TableHead>
              <TableHead className="text-xs">Code</TableHead>
              <TableHead className="text-xs text-right">Billed</TableHead>
              <TableHead className="text-xs text-right">Allowed</TableHead>
              <TableHead className="text-xs text-right">Deductible</TableHead>
              <TableHead className="text-xs text-right">Coins</TableHead>
              <TableHead className="text-xs text-right">Plan Paid</TableHead>
              <TableHead className="text-xs text-right">Member Resp</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.line_results.map((lr, idx) => {
              const claimLine = claim.lines.find(l => l.line_id === lr.line_id);
              return (
                <TableRow key={lr.line_id}>
                  <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs font-medium">{claimLine?.procedure_code ?? '—'}</TableCell>
                  <TableCell className="data-cell text-right">{formatCents(claimLine?.billed_amount ?? 0)}</TableCell>
                  <TableCell className="data-cell text-right">{formatCents(lr.allowed)}</TableCell>
                  <TableCell className="data-cell text-right amount-negative">{lr.deductible_applied > 0 ? formatCents(lr.deductible_applied) : '—'}</TableCell>
                  <TableCell className="data-cell text-right amount-negative">{lr.coinsurance > 0 ? formatCents(lr.coinsurance) : '—'}</TableCell>
                  <TableCell className="data-cell text-right amount-positive font-semibold">{formatCents(lr.plan_paid)}</TableCell>
                  <TableCell className="data-cell text-right amount-negative">{formatCents(lr.member_responsibility)}</TableCell>
                  <TableCell className="text-center">
                    <span className={lr.status === 'paid' ? 'status-paid' : lr.status === 'denied' ? 'status-denied' : 'status-adjusted'}>
                      {lr.status}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Totals */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
          <span className="text-xs font-semibold text-foreground">TOTALS</span>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Billed</div>
              <div className="font-mono text-sm font-semibold text-foreground">{formatCents(claim.total_billed)}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan Paid</div>
              <div className="font-mono text-sm font-semibold amount-positive">{formatCents(run.total_plan_paid)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Member Resp</div>
              <div className="font-mono text-sm font-semibold amount-negative">{formatCents(run.total_member_responsibility)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* COB Allocations */}
      {run.line_results.some(lr => lr.cob_allocations.length > 0) && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/20">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-status-cob" />
              COB Allocations
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {run.line_results.filter(lr => lr.cob_allocations.length > 0).map(lr => (
              <div key={lr.line_id} className="flex items-center gap-4 text-xs">
                <span className="font-mono text-muted-foreground w-20">{lr.line_id}</span>
                {lr.cob_allocations.map((cob, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/30 rounded px-2.5 py-1.5">
                    <span className="text-muted-foreground">{cob.payer_id}</span>
                    <span className="font-mono font-medium text-foreground">Paid: {formatCents(cob.paid)}</span>
                    <span className="status-cob text-[10px]">{cob.method}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments */}
      {run.line_results.some(lr => lr.adjustments.length > 0) && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/20">
            <h3 className="text-xs font-semibold text-foreground">Adjustment Details</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-1">
              <span>Line</span>
              <span>Code</span>
              <span>Category</span>
              <span className="text-right">Amount</span>
            </div>
            {run.line_results.flatMap(lr =>
              lr.adjustments.map((adj, i) => (
                <div key={`${lr.line_id}-${i}`} className="grid grid-cols-4 gap-2 text-xs py-1 px-1 border-t border-border/30">
                  <span className="font-mono text-muted-foreground">{lr.line_id}</span>
                  <span className="font-mono font-medium">{adj.reason_code}</span>
                  <span className="text-muted-foreground capitalize">{adj.category}</span>
                  <span className="font-mono text-right amount-negative">{formatCents(adj.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
