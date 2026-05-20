import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { Gavel, Loader2 } from 'lucide-react';

const STATUS_TONE: Record<string, string> = {
  draft: 'status-pending', submitted: 'status-cob', in_review: 'status-cob',
  approved: 'status-paid', denied: 'status-denied', partial: 'status-adjusted',
};

export default function Appeals() {
  const { data: claims, isLoading } = useClarityData();
  const rows = useMemo(() => {
    if (!claims) return [];
    return claims.flatMap(c => c.intel.appeals.map(a => ({ claim: c, appeal: a })));
  }, [claims]);
  const kpis = useMemo(() => {
    const dispute = rows.reduce((s, r) => s + r.appeal.amount_in_dispute_cents, 0);
    const recovered = rows.reduce((s, r) => s + (r.appeal.amount_recovered_cents ?? 0), 0);
    const inFlight = rows.filter(r => ['submitted','in_review','draft'].includes(r.appeal.status)).length;
    return { dispute, recovered, inFlight, total: rows.length };
  }, [rows]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Appeals & Evidence" subtitle="Active appeals, evidence readiness, and recovery outcomes." />
      <KpiStrip tiles={[
        { label: 'Total Appeals',  value: String(kpis.total) },
        { label: 'In Flight',      value: String(kpis.inFlight), tone: 'text-status-cob' },
        { label: 'Amount Disputed', value: formatCents(kpis.dispute), tone: 'amount-negative' },
        { label: 'Recovered',      value: formatCents(kpis.recovered), tone: 'amount-positive' },
      ]} />
      <ScrollBody>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState title="No appeals in flight" icon={<Gavel className="h-5 w-5" />} />
          ) : (
            <Panel title="Active Appeals">
              <div className="divide-y -mx-4 -my-4">
                <div className="grid grid-cols-[110px_1fr_90px_110px_140px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Claim</span><span>Rationale</span><span>Level</span><span>Status</span><span>Filed</span><span className="text-right">Disputed</span>
                </div>
                {rows.map(({ claim, appeal }) => (
                  <Link key={appeal.appeal_id} to={`/denials/${claim.claim_id}`}
                    className="grid grid-cols-[110px_1fr_90px_110px_140px_120px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40">
                    <span className="font-mono text-[12px] font-semibold text-foreground">{claim.claim_id}</span>
                    <span className="text-[12px] text-foreground truncate">{appeal.rationale}</span>
                    <span className="font-mono text-[11.5px] text-muted-foreground">L{appeal.level}</span>
                    <span className={STATUS_TONE[appeal.status] ?? 'status-pending'}>{appeal.status}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{appeal.filed_at ? relativeTime(appeal.filed_at) : 'unfiled'}</span>
                    <span className="font-mono text-[12px] text-right tabular-nums amount-negative">{formatCents(appeal.amount_in_dispute_cents)}</span>
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
