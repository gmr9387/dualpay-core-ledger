/**
 * Escalations — every claim that satisfies one or more deterministic
 * escalation triggers, ladder level, recommended owner, and an
 * audited action to raise/resolve the escalation.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents, formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, SeverityBadge, EmptyState } from '@/components/clarity/primitives';
import { useAssignments } from '@/hooks/use-assignments';
import { useOpsEvents } from '@/hooks/use-ops-events';
import { detectEscalations, LEVEL_LABEL, TRIGGER_LABEL, type EscalationCandidate, type EscalationLevel } from '@/engine/escalations';
import { Loader2, Flame, ShieldCheck } from 'lucide-react';

const LEVELS: EscalationLevel[] = [4, 3, 2, 1];

export default function Escalations() {
  const { data: claims, isLoading } = useClarityData();
  const { store } = useAssignments();
  const { events, append } = useOpsEvents();
  const [filterLevel, setFilterLevel] = useState<'all' | EscalationLevel>('all');

  const escalations = useMemo(() => claims ? detectEscalations(claims, store) : [], [claims, store]);
  const resolvedIds = useMemo(() => new Set(
    events.filter(e => e.kind === 'escalation_resolved' && e.claim_id).map(e => e.claim_id!)
  ), [events]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const open = escalations.filter(e => !resolvedIds.has(e.claim_id));
  const filtered = filterLevel === 'all' ? open : open.filter(e => e.level === filterLevel);
  const totalAtRisk = open.reduce((s, e) => s + e.at_risk_cents, 0);
  const levelCounts = LEVELS.map(l => ({ level: l, count: open.filter(e => e.level === l).length, value: open.filter(e => e.level === l).reduce((s, e) => s + e.at_risk_cents, 0) }));

  const raise = (e: EscalationCandidate) => {
    append({
      kind: 'escalation_raised',
      claim_id: e.claim_id,
      summary: `L${e.level} escalation raised → ${e.recommended_owner}. Triggers: ${e.triggers.map(t => TRIGGER_LABEL[t.kind]).join(', ')}.`,
      payload: { level: e.level, triggers: e.triggers, at_risk_cents: e.at_risk_cents },
    });
  };
  const resolve = (e: EscalationCandidate) => {
    append({
      kind: 'escalation_resolved',
      claim_id: e.claim_id,
      summary: `L${e.level} escalation resolved for ${e.claim_id}.`,
      payload: { level: e.level },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Escalations"
        subtitle="Deterministic triggers raise claims to the right owner. Every action is appended to the audit log."
      />
      <KpiStrip tiles={[
        { label: 'Open Escalations', value: String(open.length), tone: open.length > 0 ? 'text-status-denied' : 'text-status-paid' },
        { label: 'Value at Risk',    value: formatCentsCompact(totalAtRisk), tone: 'amount-negative' },
        ...levelCounts.map(l => ({ label: `Level ${l.level}`, value: `${l.count} · ${formatCentsCompact(l.value)}`, tone: l.level >= 3 ? 'text-status-denied' : 'text-status-pending' })),
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title={`Escalation Worklist (${filtered.length})`} action={
              <div className="flex items-center gap-1">
                <FilterBtn active={filterLevel === 'all'} onClick={() => setFilterLevel('all')}>All</FilterBtn>
                {LEVELS.map(l => <FilterBtn key={l} active={filterLevel === l} onClick={() => setFilterLevel(l)}>L{l}</FilterBtn>)}
              </div>
            } dense>
              {filtered.length === 0 ? (
                <div className="p-6"><EmptyState title="No open escalations" body="Triggers will surface claims here as conditions are met." icon={<ShieldCheck className="h-5 w-5" />} /></div>
              ) : (
                <div className="divide-y">
                  {filtered.slice(0, 60).map(e => (
                    <div key={e.claim_id} className="px-4 py-3 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Link to={`/denials/${e.claim_id}`} className="font-mono text-[12.5px] font-semibold text-foreground hover:underline">{e.claim_id}</Link>
                            <SeverityBadge severity={e.severity} />
                            <span className={`pill border ${e.level >= 3 ? 'bg-status-denied/15 text-status-denied border-status-denied/30' : 'bg-status-pending/15 text-status-pending border-status-pending/30'}`}>{LEVEL_LABEL[e.level]}</span>
                          </div>
                          <div className="text-[12px] text-muted-foreground truncate">{e.payer_name} · {e.age_days}d aged · → {e.recommended_owner}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-[13px] amount-negative tabular-nums">{formatCents(e.at_risk_cents)}</div>
                          <div className="flex gap-1.5 mt-1.5 justify-end">
                            <button onClick={() => raise(e)} className="text-[10.5px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">Raise</button>
                            <button onClick={() => resolve(e)} className="text-[10.5px] px-2 py-0.5 rounded border hover:bg-muted">Resolve</button>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {e.triggers.map(t => (
                          <span key={t.kind} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground">
                            <Flame className="inline h-2.5 w-2.5 mr-1 text-status-denied" />
                            {TRIGGER_LABEL[t.kind]}: {t.detail}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Trigger Catalog">
              <ul className="space-y-1.5 text-[12px]">
                {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between"><span className="text-foreground">{v}</span><span className="font-mono text-muted-foreground">{open.filter(e => e.triggers.some(t => t.kind === k)).length}</span></li>
                ))}
              </ul>
            </Panel>

            <Panel title="Recent Escalation Audit">
              <div className="space-y-2 text-[12px] max-h-[300px] overflow-y-auto">
                {events.filter(e => e.kind === 'escalation_raised' || e.kind === 'escalation_resolved').slice(0, 20).map(e => (
                  <div key={e.event_id} className="border-l-2 pl-2 py-0.5" style={{ borderColor: e.kind === 'escalation_resolved' ? 'hsl(var(--status-paid))' : 'hsl(var(--status-denied))' }}>
                    <div className="text-foreground">{e.summary}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground">{e.actor} · {relativeTime(e.occurred_at)} {e.claim_id && <>· <Link to={`/denials/${e.claim_id}`} className="text-primary hover:underline">{e.claim_id}</Link></>}</div>
                  </div>
                ))}
                {events.filter(e => e.kind === 'escalation_raised' || e.kind === 'escalation_resolved').length === 0 && (
                  <div className="text-muted-foreground italic">No escalation events yet.</div>
                )}
              </div>
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
