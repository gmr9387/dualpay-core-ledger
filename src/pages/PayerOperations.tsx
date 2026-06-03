/**
 * Payer Operations — follow-up management.
 *
 * Tracks deterministic signals:
 *  - last payer contact = most-recent payer-side timeline event
 *  - next payer follow-up = SLA due date when claim is open with payer
 *  - response time = aging of oldest open claim per payer
 *  - unresolved actions = open denials per payer
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useOpsEvents } from '@/hooks/use-ops-events';
import { Loader2, Phone, Clock, AlertOctagon } from 'lucide-react';
import type { ClarityClaim } from '@/hooks/use-clarity-data';

interface PayerOps {
  payer_id: string;
  payer_name: string;
  open_claims: ClarityClaim[];
  open_value_cents: number;
  unresolved_actions: number;
  last_contact_iso?: string;
  oldest_open_days: number;
  avg_response_days: number;
  next_followup_iso?: string;
  recovered_cents: number;
}

function lastPayerActivity(c: ClarityClaim): string | undefined {
  const ev = [...c.intel.timeline].reverse().find(t =>
    t.kind === 'DENIED' || t.kind === 'PARTIAL_PAY' || t.kind === 'INFO_REQUESTED' || t.kind === 'ACKNOWLEDGED' || t.kind === 'PAID' || t.kind === 'APPEAL_DECISION'
  );
  return ev?.occurred_at;
}

export default function PayerOperations() {
  const { data: claims, isLoading } = useClarityData();
  const { events, append } = useOpsEvents();
  const [sort, setSort] = useState<'slowest' | 'value' | 'volume'>('slowest');

  const payers = useMemo<PayerOps[]>(() => {
    if (!claims) return [];
    const groups = new Map<string, ClarityClaim[]>();
    for (const c of claims) {
      const arr = groups.get(c.intel.payer_id) ?? [];
      arr.push(c);
      groups.set(c.intel.payer_id, arr);
    }
    return [...groups.entries()].map(([pid, list]) => {
      const open = list.filter(c => c.intel.reimbursement_state !== 'paid' && c.intel.reimbursement_state !== 'resolved' && c.intel.reimbursement_state !== 'written_off');
      const openValue = open.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
      const unresolved = open.reduce((s, c) => s + c.intel.denial_events.length, 0);
      const contacts = list.map(lastPayerActivity).filter((x): x is string => !!x).sort();
      const last = contacts[contacts.length - 1];
      const oldestOpen = open.reduce((m, c) => Math.max(m, c.intel.aging_days), 0);
      const avg = list.length ? Math.round(list.reduce((s, c) => s + c.intel.aging_days, 0) / list.length) : 0;
      const recovered = list.reduce((s, c) => s + c.intel.appeals.reduce((sum, a) => sum + (a.amount_recovered_cents ?? 0), 0), 0);
      const nextDue = open.map(c => c.intel.sla_due_at).sort()[0];
      return {
        payer_id: pid, payer_name: list[0].intel.payer_name,
        open_claims: open, open_value_cents: openValue,
        unresolved_actions: unresolved, last_contact_iso: last,
        oldest_open_days: oldestOpen, avg_response_days: avg,
        next_followup_iso: nextDue, recovered_cents: recovered,
      };
    });
  }, [claims]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const sorted = [...payers].sort((a, b) => {
    if (sort === 'slowest') return b.avg_response_days - a.avg_response_days;
    if (sort === 'value')   return b.open_value_cents - a.open_value_cents;
    return b.open_claims.length - a.open_claims.length;
  });

  const totalOpenValue = payers.reduce((s, p) => s + p.open_value_cents, 0);
  const totalUnresolved = payers.reduce((s, p) => s + p.unresolved_actions, 0);
  const followupEvents = events.filter(e => e.kind === 'payer_followup_logged');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Payer Operations" subtitle="Follow-up management — last contact, next follow-up, response times, and unresolved actions." />
      <KpiStrip tiles={[
        { label: 'Payers Tracked',     value: String(payers.length) },
        { label: 'Open Value',         value: formatCentsCompact(totalOpenValue), tone: 'amount-negative' },
        { label: 'Unresolved Actions', value: String(totalUnresolved), tone: 'text-status-denied' },
        { label: 'Follow-ups Logged',  value: String(followupEvents.length) },
        { label: 'Slowest Payer',      value: sorted[0]?.payer_name?.split(' ')[0] ?? '—', sub: sorted[0] ? `avg ${sorted[0].avg_response_days}d` : '' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-3">
            <Panel title="Payer Follow-up Worklist" action={
              <div className="flex items-center gap-1">
                <FilterBtn active={sort === 'slowest'} onClick={() => setSort('slowest')}>Slowest</FilterBtn>
                <FilterBtn active={sort === 'value'}   onClick={() => setSort('value')}>Value</FilterBtn>
                <FilterBtn active={sort === 'volume'}  onClick={() => setSort('volume')}>Volume</FilterBtn>
              </div>
            } dense>
              <div className="divide-y">
                <div className="grid grid-cols-[1fr_70px_120px_110px_110px_140px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Payer</span><span>Open</span><span className="text-right">Open Value</span><span>Last Contact</span><span>Next Follow-up</span><span>Action</span>
                </div>
                {sorted.map(p => {
                  const nextOverdue = p.next_followup_iso ? new Date(p.next_followup_iso).getTime() < Date.now() : false;
                  return (
                    <div key={p.payer_id} className="grid grid-cols-[1fr_70px_120px_110px_110px_140px] gap-3 items-center px-4 py-2.5 text-[12.5px]">
                      <div>
                        <Link to="/payers" className="text-foreground font-medium hover:underline">{p.payer_name}</Link>
                        <div className="text-[10.5px] font-mono text-muted-foreground">Avg {p.avg_response_days}d · oldest {p.oldest_open_days}d · {p.unresolved_actions} unresolved</div>
                      </div>
                      <span className="font-mono">{p.open_claims.length}</span>
                      <span className="font-mono text-right tabular-nums amount-negative">{formatCents(p.open_value_cents)}</span>
                      <span className="font-mono text-muted-foreground">{p.last_contact_iso ? relativeTime(p.last_contact_iso) : '—'}</span>
                      <span className={`font-mono ${nextOverdue ? 'text-status-denied' : 'text-muted-foreground'}`}>{p.next_followup_iso ? (nextOverdue ? 'overdue' : new Date(p.next_followup_iso).toLocaleDateString()) : '—'}</span>
                      <button
                        onClick={() => append({
                          kind: 'payer_followup_logged',
                          summary: `Follow-up logged with ${p.payer_name} (${p.open_claims.length} open claims, ${formatCents(p.open_value_cents)} at risk).`,
                          payload: { payer_id: p.payer_id, open_count: p.open_claims.length },
                        })}
                        className="h-7 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Phone className="h-3 w-3" /> Log follow-up
                      </button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Slowest Payers (avg days)">
              <ul className="space-y-1.5 text-[12.5px]">
                {[...payers].sort((a, b) => b.avg_response_days - a.avg_response_days).slice(0, 5).map(p => (
                  <li key={p.payer_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{p.payer_name}</span>
                    <span className="font-mono text-status-denied"><Clock className="inline h-3 w-3 mr-1" />{p.avg_response_days}d</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Highest Recovery Yield">
              <ul className="space-y-1.5 text-[12.5px]">
                {[...payers].sort((a, b) => b.recovered_cents - a.recovered_cents).slice(0, 5).map(p => (
                  <li key={p.payer_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{p.payer_name}</span>
                    <span className="font-mono amount-positive">{formatCentsCompact(p.recovered_cents)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Highest Denial Volume">
              <ul className="space-y-1.5 text-[12.5px]">
                {[...payers].sort((a, b) => b.unresolved_actions - a.unresolved_actions).slice(0, 5).map(p => (
                  <li key={p.payer_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{p.payer_name}</span>
                    <span className="font-mono text-status-denied"><AlertOctagon className="inline h-3 w-3 mr-1" />{p.unresolved_actions}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>{children}</button>
  );
}
