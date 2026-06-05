/**
 * Phase 20 — Per-claim lineage viewer.
 * Renders the full chain: source batch → remittance line → claim → events.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, ArrowLeft } from 'lucide-react';
import {
  listLineageForClaim,
  type ClaimSourceLinkRow,
  type RemittanceLineRow,
  type LineageEventRow,
} from '@/lib/lineage';

const TYPE_BADGE: Record<string, string> = {
  row_imported: 'bg-blue-500/10 text-blue-600',
  claim_created: 'bg-indigo-500/10 text-indigo-600',
  denial_detected: 'bg-rose-500/10 text-rose-600',
  underpayment_detected: 'bg-amber-500/10 text-amber-600',
  dispute_created: 'bg-purple-500/10 text-purple-600',
  case_created: 'bg-cyan-500/10 text-cyan-600',
  outcome_recorded: 'bg-emerald-500/10 text-emerald-600',
  executive_value_attributed: 'bg-fuchsia-500/10 text-fuchsia-600',
};

function money(c?: number | null) { return `$${((c ?? 0) / 100).toFixed(2)}`; }

export default function LineageClaim() {
  const { claimId = '' } = useParams();
  const [links, setLinks] = useState<ClaimSourceLinkRow[]>([]);
  const [lines, setLines] = useState<RemittanceLineRow[]>([]);
  const [events, setEvents] = useState<LineageEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listLineageForClaim(claimId).then(r => {
      if (!alive) return;
      setLinks(r.links); setLines(r.lines); setEvents(r.events); setLoading(false);
    });
    return () => { alive = false; };
  }, [claimId]);

  const hasLineage = links.length + lines.length + events.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/lineage" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> All lineage
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-2">
          <GitBranch className="h-6 w-6" /> Lineage for {claimId}
        </h1>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !hasLineage ? (
        <Card><CardContent className="py-12 text-center">
          <p className="text-base font-medium">Lineage unavailable</p>
          <p className="text-sm text-muted-foreground mt-1">
            This claim has no recorded lineage. It may predate Phase 20 ingestion.
          </p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Source Links ({links.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {links.map(l => (
                <div key={l.link_id} className="border rounded p-3 text-sm flex justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{l.source_type}</Badge>
                    {l.source_id && <code className="text-xs text-muted-foreground">{l.source_id}</code>}
                    {l.source_row_number != null && <span className="text-xs">row #{l.source_row_number}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Remittance Lines ({lines.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lines.map(r => (
                <div key={r.remittance_line_id} className="border rounded p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <div className="font-medium">{r.payer_name ?? '—'} · {r.procedure_code ?? 'no CPT'}</div>
                    <div className="text-xs text-muted-foreground">{r.service_date ?? ''}</div>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-4">
                    <span>Billed {money(r.billed_amount_cents)}</span>
                    <span>Allowed {money(r.allowed_amount_cents)}</span>
                    <span>Paid {money(r.paid_amount_cents)}</span>
                    <span>Adj {money(r.adjustment_amount_cents)}</span>
                    {r.carc_code && <Badge variant="outline">{r.carc_code}</Badge>}
                    {r.classification && <Badge variant="secondary">{r.classification}</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Lineage Timeline ({events.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {events.map(e => (
                <div key={e.lineage_event_id} className="border rounded p-3 text-sm flex justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge className={TYPE_BADGE[e.event_type] ?? ''} variant="secondary">{e.event_type}</Badge>
                    <span className="truncate">{e.event_summary}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
