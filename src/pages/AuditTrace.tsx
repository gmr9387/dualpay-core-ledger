import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { Loader2 } from 'lucide-react';

export default function AuditTrace() {
  const { data: claims, isLoading } = useClarityData();
  const events = useMemo(() => {
    if (!claims) return [];
    return claims.flatMap(c => c.intel.timeline.map(e => ({ ...e, payer: c.intel.payer_name })))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 100);
  }, [claims]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit & Trace" subtitle="Immutable operational event log across all claims and reimbursement states." />
      <ScrollBody>
        <div className="p-5">
          <Panel title={`Recent Events (${events.length})`}>
            <div className="divide-y -mx-4 -my-4 text-[12px]">
              <div className="grid grid-cols-[140px_140px_1fr_180px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                <span>When</span><span>Kind</span><span>Description</span><span>Actor</span><span>Claim</span>
              </div>
              {events.map(e => (
                <div key={e.event_id} className="grid grid-cols-[140px_140px_1fr_180px_120px] gap-3 items-center px-4 py-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{relativeTime(e.occurred_at)}</span>
                  <span className="font-mono text-[11px] font-semibold text-foreground">{e.kind}</span>
                  <span className="text-foreground truncate">{e.description}</span>
                  <span className="text-muted-foreground truncate">{e.actor}</span>
                  <Link to={`/denials/${e.claim_id}`} className="font-mono text-[11px] text-primary hover:underline">{e.claim_id}</Link>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
