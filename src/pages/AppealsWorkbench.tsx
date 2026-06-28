/**
 * Appeals Workbench — operational view of every appeal across its
 * lifecycle (Submitted → Pending → Won / Lost), with payer response
 * tracking and recovery outcomes.
 *
 * Phase 3D (B-3): All data — both KPI tiles and appeal table rows — is now
 * sourced from live ops_events queries scoped by org_id.  The demo
 * useClarityData() dependency and the demo-data banner have been removed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { Gavel, Loader2, Filter, AlertCircle } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import { useLiveAppealRows, type LiveAppealStatus } from '@/hooks/use-live-appeal-rows';
import { supabase } from '@/integrations/supabase/client';

type FilterStatus = LiveAppealStatus | 'all';

const LIFECYCLE: Array<{ id: FilterStatus; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'in_review', label: 'Pending' },
  { id: 'won',       label: 'Won' },
  { id: 'lost',      label: 'Lost' },
  { id: 'resolved',  label: 'Resolved' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_CLS: Record<LiveAppealStatus, string> = {
  submitted:  'bg-status-cob/10 text-status-cob border-status-cob/30',
  in_review:  'bg-status-pending/10 text-status-pending border-status-pending/30',
  won:        'bg-status-paid/10 text-status-paid border-status-paid/30',
  resolved:   'bg-muted text-muted-foreground border-border',
  lost:       'bg-status-denied/10 text-status-denied border-status-denied/30',
  withdrawn:  'bg-muted text-muted-foreground border-border',
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
      supabase.from('v_appeal_pending_counts').select('pending_count').eq('org_id', orgId).maybeSingle(),
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_submitted'),
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_resolved')
        .eq('payload->>appeal_status' as never, 'won'),
      supabase.from('ops_events').select('event_id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('kind', 'appeal_resolved')
        .eq('payload->>appeal_status' as never, 'lost'),
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
  const [filter, setFilter] = useState<FilterStatus>('all');
  const { kpis: liveKpis, loading: kpisLoading } = useLiveAppealKpis(orgId);
  const { rows: appealRows, loading: rowsLoading, error: rowsError } = useLiveAppealRows(orgId);

  const filtered = useMemo(
    () => filter === 'all' ? appealRows : appealRows.filter(r => r.status === filter),
    [appealRows, filter],
  );

  const counts = useMemo(() => {
    const c: Record<FilterStatus, number> = {
      all: appealRows.length, submitted: 0, in_review: 0, won: 0, lost: 0, resolved: 0, withdrawn: 0,
    };
    for (const r of appealRows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [appealRows]);

  const winRate = liveKpis && (liveKpis.resolvedWon + liveKpis.resolvedLost) > 0
    ? liveKpis.resolvedWon / (liveKpis.resolvedWon + liveKpis.resolvedLost)
    : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Appeals Workbench" subtitle="Live view of appeal lifecycle from ops_events, scoped to your organisation." />

      {/* KPI strip */}
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

      {/* Filter tabs */}
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
            {l.label} <span className="font-mono opacity-70">({counts[l.id] ?? 0})</span>
          </button>
        ))}
      </div>

      <ScrollBody>
        <div className="p-5">
          {rowsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading appeal events…
            </div>
          ) : rowsError ? (
            <div className="flex items-center gap-2 text-status-denied text-[12.5px] py-6">
              <AlertCircle className="h-4 w-4" /> Failed to load appeal events: {rowsError}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No appeals match" body="Try a different lifecycle filter, or log an appeal via the Claim Drawer." icon={<Gavel className="h-5 w-5" />} />
          ) : (
            <Panel title={`Appeals (${filtered.length})`} dense>
              <div className="divide-y">
                <div className="grid grid-cols-[130px_80px_130px_140px_130px_130px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Claim</span><span>Events</span><span>Status</span>
                  <span>Last Activity</span><span className="text-right">Disputed</span><span className="text-right">Recovered</span>
                </div>
                {filtered.map((row) => (
                  <Link
                    key={row.claim_id}
                    to={`/denials/${row.claim_id}`}
                    className="grid grid-cols-[130px_80px_130px_140px_130px_130px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40"
                  >
                    <div className="font-mono text-[12px] font-semibold text-foreground truncate">{row.claim_id}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{row.event_count} event{row.event_count !== 1 ? 's' : ''}</div>
                    <span className={`pill border text-[10.5px] px-2 py-0.5 rounded-md w-fit ${STATUS_CLS[row.status] ?? STATUS_CLS.resolved}`}>
                      {row.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {relativeTime(row.last_activity_at)}
                    </span>
                    <span className="font-mono text-[12px] text-right tabular-nums amount-negative">
                      {row.amount_in_dispute_cents > 0 ? formatCents(row.amount_in_dispute_cents) : '—'}
                    </span>
                    <span className="font-mono text-[12px] text-right tabular-nums amount-positive">
                      {row.amount_recovered_cents != null ? formatCents(row.amount_recovered_cents) : '—'}
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

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
