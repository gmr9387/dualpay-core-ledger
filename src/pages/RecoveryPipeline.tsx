/**
 * Recovery Pipeline — kanban-style flow showing each claim's stage
 * from Denied through Recovered/Lost.  Stages are derived from
 * reimbursement state, appeals lifecycle, evidence gaps, and the
 * client-side assignment store.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, slaStatus } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, SeverityBadge } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import type { ClarityClaim } from '@/hooks/use-clarity-data';
import { Loader2, Clock } from 'lucide-react';

type Stage =
  | 'Denied'
  | 'Assigned'
  | 'Evidence Gathering'
  | 'Appeal Drafting'
  | 'Submitted'
  | 'Pending Review'
  | 'Recovered'
  | 'Lost';

const STAGES: Stage[] = ['Denied', 'Assigned', 'Evidence Gathering', 'Appeal Drafting', 'Submitted', 'Pending Review', 'Recovered', 'Lost'];

const STAGE_TONE: Record<Stage, string> = {
  'Denied':             'border-status-denied/40 bg-status-denied/5',
  'Assigned':           'border-muted-foreground/30 bg-muted/30',
  'Evidence Gathering': 'border-status-pending/30 bg-status-pending/5',
  'Appeal Drafting':    'border-status-cob/30 bg-status-cob/5',
  'Submitted':          'border-status-cob/40 bg-status-cob/10',
  'Pending Review':     'border-status-pending/40 bg-status-pending/10',
  'Recovered':          'border-status-paid/40 bg-status-paid/10',
  'Lost':               'border-status-denied/40 bg-status-denied/10',
};

function classifyStage(c: ClarityClaim, assigned: boolean): Stage {
  const i = c.intel;
  // Resolved outcomes
  if (i.reimbursement_state === 'paid' || i.reimbursement_state === 'resolved' || i.appeals.some(a => a.status === 'approved' || a.status === 'partial')) return 'Recovered';
  if (i.reimbursement_state === 'written_off' || i.appeals.every(a => a.status === 'denied') && i.appeals.length > 0) return 'Lost';
  // Appeal lifecycle
  const submittedAppeal = i.appeals.find(a => a.status === 'submitted');
  const pendingAppeal = i.appeals.find(a => a.status === 'in_review');
  const draftAppeal = i.appeals.find(a => a.status === 'draft');
  if (pendingAppeal) return 'Pending Review';
  if (submittedAppeal) return 'Submitted';
  if (draftAppeal) return 'Appeal Drafting';
  if (i.evidence_missing.length > 0) return 'Evidence Gathering';
  if (assigned) return 'Assigned';
  return 'Denied';
}

export default function RecoveryPipeline() {
  const { data: claims, isLoading } = useClarityData();
  const { store } = useAssignments();

  const grouped = useMemo(() => {
    const out: Record<Stage, Array<{ c: ClarityClaim }>> = {
      'Denied': [], 'Assigned': [], 'Evidence Gathering': [], 'Appeal Drafting': [],
      'Submitted': [], 'Pending Review': [], 'Recovered': [], 'Lost': [],
    };
    if (!claims) return out;
    for (const c of claims) {
      const assigned = !!store[c.claim_id]?.assignee;
      out[classifyStage(c, assigned)].push({ c });
    }
    for (const s of STAGES) out[s].sort((a, b) => b.c.intel.amount_at_risk_cents - a.c.intel.amount_at_risk_cents);
    return out;
  }, [claims, store]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const totals = Object.fromEntries(STAGES.map(s => [s, grouped[s].reduce((sum, x) => sum + x.c.intel.amount_at_risk_cents, 0)])) as Record<Stage, number>;
  const pipelineValue = STAGES.filter(s => s !== 'Recovered' && s !== 'Lost').reduce((s, st) => s + totals[st], 0);
  const recovered = totals['Recovered'];
  const lost = totals['Lost'];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Recovery Pipeline" subtitle="End-to-end flow of denied claims through assignment, evidence, appeal, and outcome." />
      <KpiStrip tiles={[
        { label: 'Pipeline Value',   value: formatCentsCompact(pipelineValue), tone: 'amount-negative' },
        { label: 'Recovered',        value: formatCentsCompact(recovered),     tone: 'amount-positive' },
        { label: 'Lost',             value: formatCentsCompact(lost),          tone: 'amount-negative' },
        { label: 'Total Claims',     value: String(claims?.length ?? 0) },
        { label: 'In Active Stages', value: String(STAGES.filter(s => s !== 'Recovered' && s !== 'Lost').reduce((s, st) => s + grouped[st].length, 0)) },
      ]} />
      <ScrollBody>
        <div className="p-4">
          <div className="grid grid-cols-8 gap-2 h-full min-h-0">
            {STAGES.map(stage => (
              <div key={stage} className={`flex flex-col rounded border-t-2 ${STAGE_TONE[stage]} min-h-[400px]`}>
                <div className="px-2 py-2 border-b bg-card">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{stage}</div>
                    <span className="font-mono text-[11px] text-muted-foreground">{grouped[stage].length}</span>
                  </div>
                  <div className="text-[10.5px] font-mono amount-negative">{formatCentsCompact(totals[stage])}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {grouped[stage].slice(0, 50).map(({ c }) => {
                    const sla = slaStatus(c.intel.sla_due_at);
                    const slaCls = sla.tone === 'breach' ? 'text-status-denied' : sla.tone === 'warn' ? 'text-status-pending' : 'text-status-paid';
                    return (
                      <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="block rounded border bg-card p-2 hover:bg-muted/40">
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className="font-mono text-[10.5px] font-semibold text-foreground truncate">{c.claim_id}</span>
                          <SeverityBadge severity={c.intel.severity} />
                        </div>
                        <div className="text-[10.5px] text-muted-foreground truncate">{c.intel.payer_name}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-mono text-[10.5px] tabular-nums amount-negative">{formatCentsCompact(c.intel.amount_at_risk_cents)}</span>
                          <span className={`text-[9.5px] font-mono flex items-center gap-0.5 ${slaCls}`}>
                            <Clock className="h-2.5 w-2.5" />{c.intel.aging_days}d
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                  {grouped[stage].length === 0 && (
                    <div className="text-center text-[11px] text-muted-foreground py-6 italic">—</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
