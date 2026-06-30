/**
 * AuditTrace — Phase 4A
 * Reads live ops_events scoped to the current organization.
 * Supports date-range filtering, event-kind filtering, and CSV export.
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useOrg } from '@/hooks/use-org';
import { getOpsEventsByOrg, type OpsEvent } from '@/lib/ops-events';
import { PageHeader, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { Loader2, Download, Filter } from 'lucide-react';

const KIND_OPTIONS = [
  'assignment_changed', 'escalation_raised', 'escalation_resolved',
  'document_uploaded', 'appeal_packet_generated', 'audit_export_requested',
  'workflow_transition', 'payer_followup_logged', 'sla_acknowledged',
  'claim_written_off', 'claim_resolved', 'evidence_attached',
  'appeal_submitted',
] as const;

function exportCsv(events: OpsEvent[]) {
  const cols = ['occurred_at', 'kind', 'summary', 'actor', 'actor_email', 'claim_id', 'org_id'];
  const header = cols.join(',');
  const rows = events.map(e =>
    cols.map(c => {
      const v = (e as Record<string, unknown>)[c] ?? '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AuditTrace() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [since, setSince] = useState(thirtyDaysAgo);
  const [until, setUntil] = useState(today);
  const [kindFilter, setKindFilter] = useState('');

  const { data: events, isLoading } = useQuery({
    queryKey: ['audit-ops-events', orgId, since, until, kindFilter],
    queryFn: () =>
      getOpsEventsByOrg(orgId!, {
        since: since ? `${since}T00:00:00Z` : undefined,
        until: until ? `${until}T23:59:59Z` : undefined,
        kinds: kindFilter ? [kindFilter] : undefined,
        limit: 500,
      }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const handleExport = useCallback(() => {
    if (events?.length) exportCsv(events);
  }, [events]);

  if (!orgId || isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading audit events…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Audit & Trace"
        subtitle="Immutable operational event log — org-scoped, live data only."
      />
      <ScrollBody>
        <div className="p-5 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex items-center gap-1.5">
              <label className="text-[11.5px] text-muted-foreground">From</label>
              <input
                type="date"
                value={since}
                max={until || today}
                onChange={e => setSince(e.target.value)}
                className="h-7 rounded border border-border bg-background px-2 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11.5px] text-muted-foreground">To</label>
              <input
                type="date"
                value={until}
                min={since}
                max={today}
                onChange={e => setUntil(e.target.value)}
                className="h-7 rounded border border-border bg-background px-2 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11.5px] text-muted-foreground">Event type</label>
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value)}
                className="h-7 rounded border border-border bg-background px-2 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All types</option>
                {KIND_OPTIONS.map(k => (
                  <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExport}
              disabled={!events?.length}
              className="ml-auto flex items-center gap-1.5 h-7 rounded border border-border bg-background px-3 text-[11.5px] text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>

          <Panel title={`Audit Events (${events?.length ?? 0})`}>
            {events?.length === 0 ? (
              <EmptyState
                title="No audit events found"
                body="No events match the current filter range. Adjust the date or event type filter."
              />
            ) : (
              <div className="divide-y -mx-4 -my-4 text-[12px]">
                <div className="grid grid-cols-[160px_180px_1fr_160px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Timestamp</span>
                  <span>Event Kind</span>
                  <span>Description</span>
                  <span>Actor</span>
                  <span>Claim</span>
                </div>
                {events?.map(e => (
                  <div key={e.event_id} className="grid grid-cols-[160px_180px_1fr_160px_120px] gap-3 items-start px-4 py-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{formatTimestamp(e.occurred_at)}</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground">{e.kind}</span>
                    <div>
                      <span className="text-foreground">{e.summary}</span>
                      {/* Phase 4B: display write-off reason in audit trail */}
                      {e.kind === 'claim_written_off' && (e.payload as Record<string, unknown>)?.reason && (
                        <div className="text-[10.5px] font-mono text-status-denied mt-0.5">
                          Reason: {String((e.payload as Record<string, unknown>).reason)}
                        </div>
                      )}
                    </div>
                    <span className="text-muted-foreground truncate">{e.actor_name ?? e.actor_email ?? e.actor ?? '—'}</span>
                    {e.claim_id ? (
                      <Link to={`/denials/${e.claim_id}`} className="font-mono text-[11px] text-primary hover:underline">{e.claim_id}</Link>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
