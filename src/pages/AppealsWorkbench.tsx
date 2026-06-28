/**
 * Appeals Workbench — operational view of every appeal across its
 * lifecycle (Draft → Submitted → Pending → Won / Lost), with
 * readiness scoring and evidence linkage.
 *
 * Phase 3C (C-4/M-3): KPI tiles backed by live ops_events queries
 * scoped by org_id. Demo clarity data remains for the appeal table
 * rows; a prominent banner marks those as demo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState, RecoverabilityBar } from '@/components/clarity/primitives';
import type { Appeal, AppealStatus } from '@/types/clarity';
import { Gavel, Loader2, Filter, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';

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

/** C-4/M-3: Live appeal KPIs from ops_events, scoped by org_id. */
function useLiveAppealKpis(orgId: string) {
  const [kpis, setKpis] = useState<{
    totalAppeals: number;
    pendingCount: number;
    resolvedWon: number;
    resolvedLost: number;
    recoveredCents: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    setLoading(true);

    Promise.all([
      // H-1/M-2: pending count from the correctly ordered view
      supabase.from('v_appeal_pending_counts').select('pending_count').eq('org_id', orgId).maybeSingle(),
      // Total appeal events submitted
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_submitted'),
      // Won appeals (payload.appeal_status = 'won')
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_resolved')
        .eq('payload->>appeal_status' as never, 'won'),
      // Lost appeals
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_resolved')
        .eq('payload->>appeal_status' as never, 'lost'),
      // Recovery recorded amounts
      supabase.from('ops_events').select('payload').eq('org_id', orgId).eq('kind', 'recovery_recorded'),
    ]).then(([pendingRow, { count: total }, { count: won }, { count: lost }, { data: recovRows }]) => {
      if (!alive) return;
      const recoveredCents = (recovRows ?? []).reduce(
        (sum, r) => sum + Number(((r.payload as Record<string, unknown>)?.amount_cents) ?? 0), 0,
      );
      setKpis({
        totalAppeals: total ?? 0,
        pendingCount: (pendingRow.data as { pending_count?: number } | null)?.pending_count ?? 0,
        resolvedWon: won ?? 0,
        resolvedLost: lost ?? 0,
        recoveredCents,
      });
    }).catch(() => { /* silently fall back to zeros */ }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [orgId]);

  return { kpis, loading };
}

export default function AppealsWorkbench() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? '';
  const { data: claims, isLoading } = useClarityData();
  const [filter, setFilter] = useState<AppealStatus | 'all'>('all');
  const { kpis: liveKpis, loading: kpisLoading } = useLiveAppealKpis(orgId);

  const all = useMemo(() => {
    if (!claims) return [];
    return claims.flatMap(c => c.intel.appeals.map(a => ({ claim: c, appeal: a })));
  }, [claims]);
  const filtered = useMemo(() => filter === 'all' ? all : all.filter(r => r.appeal.status === filter), [all, filter]);

  const counts: Record<AppealStatus | 'all', number> = {
    all: all.length, draft: 0, submitted: 0, in_review: 0, approved: 0, denied: 0, partial: 0,
  };
  for (const r of all) counts[r.appeal.status]++;

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const winRate = liveKpis && (liveKpis.resolvedWon + liveKpis.resolvedLost) > 0
    ? liveKpis.resolvedWon / (liveKpis.resolvedWon + liveKpis.resolvedLost)
    : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Appeals Workbench" subtitle="Lifecycle view of appeals with readiness scoring, payer response tracking, and recovery outcomes." />

      {/* C-4/M-3: Live KPI strip from ops_events */}
      {kpisLoading ? (
        <div className="px-5 py-2 text-[11.5px] text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading live KPIs…
        </div>
      ) : liveKpis ? (
        <KpiStrip tiles={[
          { label: 'Appeals Submitted',  value: String(liveKpis.totalAppeals) },
          { label: 'Pending Response',   value: String(liveKpis.pendingCount),    tone: liveKpis.pendingCount > 0 ? 'text-status-pending' : undefined },
          { label: 'Won',                value: String(liveKpis.resolvedWon),      tone: 'text-status-paid' },
          { label: 'Lost',               value: String(liveKpis.resolvedLost),     tone: 'text-status-denied' },
          { label: 'Win Rate',           value: winRate !== null ? `${(winRate * 100).toFixed(0)}%` : '—', tone: 'text-status-cob' },
          { label: 'Recovered',          value: formatCentsCompact(liveKpis.recoveredCents), tone: 'amount-positive' },
        ]} />
      ) : null}

      {/* C-4/M-3: Demo data banner for the appeal table rows */}
      <div className="mx-5 mt-3 mb-1 flex items-start gap-2 rounded-md border border-status-pending/40 bg-status-pending/5 px-3 py-2 text-[11.5px] text-status-pending">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Demo data:</strong> The appeal rows below are sourced from sample clarity data.
          Connect a live payer feed to replace them with real adjudication records.
          KPI tiles above reflect live <code>ops_events</code> for your org.
        </span>
      </div>

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
