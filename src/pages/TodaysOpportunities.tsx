/**
 * Today's Recovery Opportunities
 * Prioritised list of claims to work today: highest revenue at risk,
 * highest recoverability, soonest SLA / appeal deadlines.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, slaStatus } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, SeverityBadge, AgingChip, RecoverabilityBar, OwnerChip, EmptyState } from '@/components/clarity/primitives';
import { explainRecoverability } from '@/engine/recoverability';
import { Loader2, Target, Clock, ArrowRight } from 'lucide-react';
import { useAssignments } from '@/hooks/use-assignments';

export default function TodaysOpportunities() {
  const { data: claims, isLoading } = useClarityData();
  const { get, setStatus } = useAssignments();

  const ranked = useMemo(() => {
    if (!claims) return [];
    return claims
      .filter(c => c.intel.amount_at_risk_cents > 0 && c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved')
      .map(c => {
        const exp = explainRecoverability(c);
        const slaHours = (new Date(c.intel.sla_due_at).getTime() - Date.now()) / 3_600_000;
        // Composite priority: $ * recoverability% / max(1, slaHours+24)
        const priority = (c.intel.amount_at_risk_cents / 100) * (exp.score / 100) / Math.max(1, slaHours + 48);
        return { c, exp, priority };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 20);
  }, [claims]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const dailyRecoverable = ranked.reduce((s, r) => s + Math.round(r.c.intel.amount_at_risk_cents * r.exp.score / 100), 0);
  const totalAtRisk = ranked.reduce((s, r) => s + r.c.intel.amount_at_risk_cents, 0);
  const slaBreach = ranked.filter(r => slaStatus(r.c.intel.sla_due_at).tone === 'breach').length;
  const highTier = ranked.filter(r => r.exp.tier === 'HIGH').length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Today's Recovery Opportunities"
        subtitle="Top revenue actions ranked by recoverable dollars, recoverability score, and SLA urgency."
      />
      <KpiStrip tiles={[
        { label: 'Opportunities',         value: String(ranked.length) },
        { label: 'Probable Recovery',     value: formatCentsCompact(dailyRecoverable), tone: 'amount-positive', sub: 'dollar-weighted by recoverability' },
        { label: 'Total At Risk',         value: formatCentsCompact(totalAtRisk),       tone: 'amount-negative' },
        { label: 'High-Probability',      value: String(highTier),                       tone: 'text-status-paid' },
        { label: 'SLA Breaches',          value: String(slaBreach),                      tone: 'text-status-denied' },
      ]} />
      <ScrollBody>
        <div className="p-5">
          {ranked.length === 0 ? (
            <EmptyState title="Inbox zero" body="Nothing prioritised for recovery work right now." icon={<Target className="h-5 w-5" />} />
          ) : (
            <Panel title={`Prioritised Work — ${ranked.length} claims`} dense>
              <div className="divide-y">
                <div className="grid grid-cols-[36px_110px_1fr_110px_110px_120px_130px_140px_130px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>#</span><span>Claim</span><span>Payer / Owner</span><span>Recov.</span>
                  <span>Severity</span><span>Aging</span><span className="text-right">At Risk</span>
                  <span className="text-right">Recoverable</span><span>SLA</span>
                </div>
                {ranked.map((r, i) => {
                  const sla = slaStatus(r.c.intel.sla_due_at);
                  const slaCls = sla.tone === 'breach' ? 'text-status-denied' : sla.tone === 'warn' ? 'text-status-pending' : 'text-status-paid';
                  const expectedRecover = Math.round(r.c.intel.amount_at_risk_cents * r.exp.score / 100);
                  const a = get(r.c.claim_id);
                  return (
                    <div key={r.c.claim_id} className="grid grid-cols-[36px_110px_1fr_110px_110px_120px_130px_140px_130px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40">
                      <span className="font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                      <Link to={`/denials/${r.c.claim_id}`} className="font-mono text-[12px] font-semibold text-primary hover:underline">{r.c.claim_id}</Link>
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="text-[12.5px] truncate text-foreground">{r.c.intel.payer_name}</div>
                          <div className="text-[10.5px] text-muted-foreground truncate">{r.c.provider_name}</div>
                        </div>
                        <OwnerChip owner={r.c.intel.workflow_owner} />
                      </div>
                      <div>
                        <RecoverabilityBar score={r.exp.score} />
                        <div className="text-[9.5px] font-mono uppercase mt-0.5 text-muted-foreground">{r.exp.tier}</div>
                      </div>
                      <SeverityBadge severity={r.c.intel.severity} />
                      <AgingChip bucket={r.c.intel.aging_bucket} />
                      <span className="font-mono text-[12.5px] text-right tabular-nums amount-negative">{formatCents(r.c.intel.amount_at_risk_cents)}</span>
                      <span className="font-mono text-[12.5px] text-right tabular-nums amount-positive">≈{formatCents(expectedRecover)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-mono flex items-center gap-1 ${slaCls}`}>
                          <Clock className="h-3 w-3" /> {sla.label}
                        </span>
                        <button
                          onClick={() => setStatus(r.c.claim_id, a.status === 'in_progress' ? 'open' : 'in_progress')}
                          className={`ml-auto text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded border ${
                            a.status === 'in_progress'
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-input text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {a.status === 'in_progress' ? 'Working' : 'Start'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <div className="mt-4 flex justify-end">
            <Link to="/denials" className="text-[12px] text-primary hover:underline inline-flex items-center gap-1">
              Open full denial intelligence <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
