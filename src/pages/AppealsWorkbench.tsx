/**
 * Appeals Workbench — operational view of every appeal across its
 * lifecycle (Draft → Submitted → Pending → Won / Lost), with
 * readiness scoring and evidence linkage.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState, RecoverabilityBar } from '@/components/clarity/primitives';
import type { Appeal, AppealStatus } from '@/types/clarity';
import { Gavel, Loader2, Filter } from 'lucide-react';

const LIFECYCLE: Array<{ id: AppealStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'in_review', label: 'Pending' },
  { id: 'approved', label: 'Won' },
  { id: 'partial', label: 'Partial Win' },
  { id: 'denied', label: 'Lost' },
];

const STATUS_CLS: Record<AppealStatus, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  submitted: 'bg-status-cob/10 text-status-cob border-status-cob/30',
  in_review: 'bg-status-pending/10 text-status-pending border-status-pending/30',
  approved:  'bg-status-paid/10 text-status-paid border-status-paid/30',
  partial:   'bg-status-adjusted/10 text-status-adjusted border-status-adjusted/30',
  denied:    'bg-status-denied/10 text-status-denied border-status-denied/30',
};

export default function AppealsWorkbench() {
  const { data: claims, isLoading } = useClarityData();
  const [filter, setFilter] = useState<AppealStatus | 'all'>('all');

  const all = useMemo(() => {
    if (!claims) return [];
    return claims.flatMap(c => c.intel.appeals.map(a => ({ claim: c, appeal: a })));
  }, [claims]);
  const filtered = useMemo(() => filter === 'all' ? all : all.filter(r => r.appeal.status === filter), [all, filter]);

  const counts: Record<AppealStatus | 'all', number> = {
    all: all.length, draft: 0, submitted: 0, in_review: 0, approved: 0, denied: 0, partial: 0,
  };
  for (const r of all) counts[r.appeal.status]++;

  const kpis = useMemo(() => {
    const dispute = all.reduce((s, r) => s + r.appeal.amount_in_dispute_cents, 0);
    const recovered = all.reduce((s, r) => s + (r.appeal.amount_recovered_cents ?? 0), 0);
    const decided = all.filter(r => ['approved','denied','partial'].includes(r.appeal.status));
    const wins = all.filter(r => r.appeal.status === 'approved' || r.appeal.status === 'partial');
    const winRate = decided.length ? wins.length / decided.length : 0;
    const avgReadiness = all.length ? Math.round(all.reduce((s, r) => s + r.appeal.appeal_readiness_score, 0) / all.length) : 0;
    return { dispute, recovered, winRate, avgReadiness };
  }, [all]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Appeals Workbench" subtitle="Lifecycle view of appeals with readiness scoring, payer response tracking, and recovery outcomes." />
      <KpiStrip tiles={[
        { label: 'Total Appeals',      value: String(all.length) },
        { label: 'Amount Disputed',    value: formatCentsCompact(kpis.dispute),  tone: 'amount-negative' },
        { label: 'Recovered',          value: formatCentsCompact(kpis.recovered), tone: 'amount-positive' },
        { label: 'Win Rate',           value: `${(kpis.winRate * 100).toFixed(0)}%`, tone: 'text-status-cob' },
        { label: 'Avg Readiness',      value: `${kpis.avgReadiness}/100`,         tone: kpis.avgReadiness >= 70 ? 'text-status-paid' : 'text-status-pending' },
      ]} />

      <div className="px-5 py-3 border-b bg-card flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {LIFECYCLE.map(l => (
          <button
            key={l.id}
            onClick={() => setFilter(l.id)}
            className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-colors ${
              filter === l.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {l.label} <span className="font-mono opacity-70">({counts[l.id]})</span>
          </button>
        ))}
      </div>

      <ScrollBody>
        <div className="p-5">
          {filtered.length === 0 ? (
            <EmptyState title="No appeals match" body="Try a different lifecycle filter." icon={<Gavel className="h-5 w-5" />} />
          ) : (
            <Panel title={`Appeals (${filtered.length})`} dense>
              <div className="divide-y">
                <div className="grid grid-cols-[110px_1fr_70px_110px_130px_120px_140px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Claim</span><span>Rationale</span><span>Level</span><span>Status</span>
                  <span>Readiness</span><span>Filed</span><span className="text-right">Disputed</span><span className="text-right">Recovered</span>
                </div>
                {filtered.map(({ claim, appeal }) => (
                  <Link key={appeal.appeal_id} to={`/denials/${claim.claim_id}`} className="grid grid-cols-[110px_1fr_70px_110px_130px_120px_140px_120px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40">
                    <div>
                      <div className="font-mono text-[12px] font-semibold text-foreground">{claim.claim_id}</div>
                      <div className="text-[10.5px] text-muted-foreground truncate">{claim.intel.payer_name}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-foreground truncate">{appeal.rationale}</div>
                      <div className="text-[10.5px] text-muted-foreground truncate">{appeal.evidence_attached.length} evidence item(s) attached</div>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">L{appeal.level}</span>
                    <span className={`pill border ${STATUS_CLS[appeal.status]}`}>{labelFor(appeal.status)}</span>
                    <RecoverabilityBar score={appeal.appeal_readiness_score} />
                    <span className="text-[11px] text-muted-foreground font-mono">{appeal.filed_at ? relativeTime(appeal.filed_at) : 'unfiled'}</span>
                    <span className="font-mono text-[12px] text-right tabular-nums amount-negative">{formatCents(appeal.amount_in_dispute_cents)}</span>
                    <span className="font-mono text-[12px] text-right tabular-nums amount-positive">
                      {appeal.amount_recovered_cents != null ? formatCents(appeal.amount_recovered_cents) : '—'}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </ScrollBody>
    </div>
  );
}

function labelFor(s: AppealStatus): string {
  return s === 'in_review' ? 'pending' : s === 'approved' ? 'won' : s === 'denied' ? 'lost' : s;
}
