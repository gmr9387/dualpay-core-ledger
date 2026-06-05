/**
 * Phase 20 — Lineage Home: recent lineage events across the org.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { GitBranch, FileSearch } from 'lucide-react';
import {
  listRecentLineageEvents,
  getLineageSummary,
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

export default function LineageHome() {
  const [events, setEvents] = useState<LineageEventRow[]>([]);
  const [summary, setSummary] = useState({ total_lines: 0, total_links: 0, total_events: 0 });
  const [filter, setFilter] = useState('');

  useEffect(() => {
    listRecentLineageEvents(300).then(setEvents);
    getLineageSummary().then(setSummary);
  }, []);

  const filtered = events.filter(e =>
    !filter ||
    e.event_summary.toLowerCase().includes(filter.toLowerCase()) ||
    (e.claim_id ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GitBranch className="h-6 w-6" /> Recovery Lineage
          </h1>
          <p className="text-sm text-muted-foreground">
            End-to-end traceability from imported remittance rows to disputes, cases, and outcomes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Remittance Lines</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.total_lines.toLocaleString()}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Claim Source Links</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.total_links.toLocaleString()}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Lineage Events</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.total_events.toLocaleString()}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Lineage Activity</CardTitle>
          <Input placeholder="Filter by claim or summary…" value={filter}
            onChange={(e) => setFilter(e.target.value)} className="max-w-sm mt-2" />
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No lineage events recorded yet. Import a batch to populate.</p>
          )}
          {filtered.slice(0, 200).map(e => (
            <div key={e.lineage_event_id}
              className="flex items-center justify-between border rounded p-3 text-sm hover:bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={TYPE_BADGE[e.event_type] ?? ''} variant="secondary">{e.event_type}</Badge>
                <span className="truncate">{e.event_summary}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{new Date(e.created_at).toLocaleString()}</span>
                {e.claim_id && (
                  <Link to={`/lineage/claim/${e.claim_id}`}
                    className="flex items-center gap-1 text-primary hover:underline">
                    <FileSearch className="h-3 w-3" /> {e.claim_id}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
