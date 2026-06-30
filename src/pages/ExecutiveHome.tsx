/**
 * Executive ROI Dashboard — Phase 3C Step 2
 *
 * All KPIs are backed by live SQL queries via useExecutiveROI().
 * No scenario/demo-generated data is used on this page.
 */
import { Link } from 'react-router-dom';
import { Loader2, BarChart3, TrendingUp, Trophy, Users, AlertCircle } from 'lucide-react';
import { useExecutiveROI } from '@/hooks/use-executive-roi';
import { formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';

export default function ExecutiveHome() {
  const { data: roi, isLoading, isError, error } = useExecutiveROI();

  // ── Global loading ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading executive ROI data…
      </div>
    );
  }

  // ── Global error ──────────────────────────────────────────────
  if (isError || !roi) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Executive ROI Dashboard" subtitle="Live recovery metrics for your organization." />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm py-12">
            <AlertCircle className="h-8 w-8 mx-auto text-status-denied mb-3" />
            <h3 className="text-sm font-semibold text-foreground">Unable to load dashboard data</h3>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'An unexpected error occurred. Please refresh and try again.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    revenueRecoveredThisMonth,
    revenueRecovered90Days,
    openRecoveryOpportunity,
    topPayersByLostRevenue,
    appealWinRate,
    recoveryRate,
    assignedCount,
    unassignedCount,
    totalActiveWork,
    outcomeCount,
  } = roi;

  const hasOutcomes = outcomeCount > 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Executive ROI Dashboard"
        subtitle="Live recovery metrics — how much was recovered, what's at risk, and where work stands."
      />

      {/* KPI strip ─ top-level snapshot */}
      <KpiStrip tiles={[
        {
          label: 'Recovered This Month',
          value: hasOutcomes ? formatCentsCompact(revenueRecoveredThisMonth) : '—',
          tone: 'amount-positive',
        },
        {
          label: 'Recovered (90 Days)',
          value: hasOutcomes ? formatCentsCompact(revenueRecovered90Days) : '—',
          tone: 'amount-positive',
        },
        {
          label: 'Open Opportunity',
          value: openRecoveryOpportunity > 0 ? formatCentsCompact(openRecoveryOpportunity) : '—',
          tone: 'amount-negative',
        },
        {
          label: 'Recovery Rate',
          value: recoveryRate !== null ? `${(recoveryRate * 100).toFixed(1)}%` : '—',
          tone: 'text-status-paid',
        },
        {
          label: 'Appeal Win Rate',
          value: appealWinRate !== null ? `${(appealWinRate * 100).toFixed(0)}%` : '—',
          tone: 'text-status-cob',
        },
        {
          label: 'Active Work',
          value: String(totalActiveWork),
          sub: totalActiveWork > 0 ? `${assignedCount} assigned · ${unassignedCount} unassigned` : undefined,
        },
      ]} />

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">

          {/* Left column — 2/3 width */}
          <div className="col-span-2 space-y-4">

            {/* Revenue Recovered This Month + Last 90 Days */}
            <Panel title="Revenue Recovered">
              {!hasOutcomes ? (
                <EmptyState
                  title="No recovery outcomes recorded yet"
                  body="Log your first recovery in the Outcome Log to start tracking revenue reclaimed."
                  action={{ label: 'Open Outcome Log', to: '/outcomes' }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded border bg-muted/30 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">This Month</div>
                    <div className="font-mono text-[22px] font-semibold amount-positive tabular-nums">
                      {formatCentsCompact(revenueRecoveredThisMonth)}
                    </div>
                    {revenueRecoveredThisMonth === 0 && (
                      <div className="text-[11px] text-muted-foreground mt-1">No recoveries logged this month</div>
                    )}
                  </div>
                  <div className="rounded border bg-muted/30 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Last 90 Days</div>
                    <div className="font-mono text-[22px] font-semibold amount-positive tabular-nums">
                      {formatCentsCompact(revenueRecovered90Days)}
                    </div>
                    {revenueRecovered90Days === 0 && (
                      <div className="text-[11px] text-muted-foreground mt-1">No recoveries in last 90 days</div>
                    )}
                  </div>
                </div>
              )}
            </Panel>

            {/* Top 5 Payers by Lost Revenue */}
            <Panel title="Top 5 Payers by Lost Revenue" action={
              <Link to="/executive/payers" className="text-[11.5px] text-primary hover:underline">Full scorecard</Link>
            }>
              {topPayersByLostRevenue.length === 0 ? (
                <EmptyState
                  title="No payer outcome data yet"
                  body="Once recovery outcomes are logged with payer information, the biggest revenue gaps will appear here."
                />
              ) : (
                <div className="divide-y -mx-4">
                  {topPayersByLostRevenue.map((p, i) => (
                    <div key={p.payer_id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="font-mono text-[11px] text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-foreground truncate">{p.payer_name || p.payer_id}</div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">
                          {formatCentsCompact(p.denied_cents)} denied · {formatCentsCompact(p.recovered_cents)} recovered
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[13px] amount-negative tabular-nums">
                          {formatCentsCompact(p.lost_revenue_cents)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">lost</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Assigned vs Unassigned Work */}
            <Panel title="Assigned vs Unassigned Work">
              {totalActiveWork === 0 ? (
                <EmptyState
                  title="No active work items"
                  body="Open or in-progress claim assignments will appear here once work is queued."
                  action={{ label: 'View Work Queues', to: '/queues' }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded border bg-muted/30 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Assigned</div>
                    <div className="font-mono text-[22px] font-semibold text-status-paid tabular-nums">{assignedCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {totalActiveWork > 0
                        ? `${Math.round((assignedCount / totalActiveWork) * 100)}% of active work`
                        : 'claims'}
                    </div>
                  </div>
                  <div className="rounded border bg-muted/30 p-4">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Unassigned</div>
                    <div className="font-mono text-[22px] font-semibold text-status-pending tabular-nums">{unassignedCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {unassignedCount > 0 ? 'needs assignment' : 'all work assigned'}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* Right column — 1/3 width */}
          <div className="space-y-4">

            {/* Open Recovery Opportunity */}
            <Panel title="Open Recovery Opportunity">
              {openRecoveryOpportunity === 0 ? (
                <div className="text-[12.5px] text-muted-foreground py-2">
                  No open denied or appealing claims found.
                </div>
              ) : (
                <>
                  <div className="font-mono text-[24px] font-semibold amount-negative tabular-nums">
                    {formatCentsCompact(openRecoveryOpportunity)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Total billed on denied, adjusted, and appealing claims
                  </div>
                </>
              )}
            </Panel>

            {/* Appeal Win Rate */}
            <Panel title="Appeal Win Rate">
              {appealWinRate === null ? (
                <div className="text-[12.5px] text-muted-foreground py-2">
                  No appeal outcomes logged yet.
                  <br />
                  <Link to="/outcomes" className="text-primary hover:underline text-[12px] mt-1 inline-block">
                    Log appeal outcomes →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="font-mono text-[24px] font-semibold text-status-cob tabular-nums">
                    {(appealWinRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">of appeals result in recovery</div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-status-cob/70 rounded-full" style={{ width: `${(appealWinRate * 100).toFixed(0)}%` }} />
                  </div>
                </>
              )}
            </Panel>

            {/* Recovery Rate */}
            <Panel title="Recovery Rate">
              {recoveryRate === null ? (
                <div className="text-[12.5px] text-muted-foreground py-2">
                  No outcome history yet.
                  <br />
                  <Link to="/outcomes" className="text-primary hover:underline text-[12px] mt-1 inline-block">
                    Log first outcome →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="font-mono text-[24px] font-semibold text-status-paid tabular-nums">
                    {(recoveryRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">of denied dollars recovered</div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-status-paid/70 rounded-full" style={{ width: `${Math.min(100, recoveryRate * 100).toFixed(0)}%` }} />
                  </div>
                </>
              )}
            </Panel>

            {/* Drilldown navigation */}
            <Panel title="Drilldowns">
              <div className="space-y-1.5">
                <NavCard to="/executive/recovery" icon={<TrendingUp className="h-3.5 w-3.5" />} label="Recovery Attribution" sub="By category, owner, action" />
                <NavCard to="/executive/payers"   icon={<Users       className="h-3.5 w-3.5" />} label="Payer Scorecards"      sub="Performance & opportunity" />
                <NavCard to="/executive/playbooks"icon={<Trophy      className="h-3.5 w-3.5" />} label="Playbook Effectiveness" sub="Which workflows work" />
                <NavCard to="/executive/value"    icon={<BarChart3   className="h-3.5 w-3.5" />} label="Value Realization"      sub="Monthly + lifetime ROI" />
              </div>
            </Panel>

            <div className="rounded border bg-card p-3 text-[11px] text-muted-foreground leading-snug">
              All metrics query <code className="font-mono text-[10px]">recovery_outcomes</code>,{' '}
              <code className="font-mono text-[10px]">claims</code>, and{' '}
              <code className="font-mono text-[10px]">claim_assignments</code> live.
              Data is org-scoped via RLS. No demo values are used.
            </div>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function NavCard({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded border bg-muted/30 px-2.5 py-2 hover:bg-muted/60 transition-colors">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="text-[10.5px] text-muted-foreground">{sub}</div>
      </div>
    </Link>
  );
}
