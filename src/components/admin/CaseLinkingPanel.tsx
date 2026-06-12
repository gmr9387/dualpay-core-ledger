/**
 * Case Linking — surfaces the N-claim→1-case relationship for the
 * currently selected claim. Presentation only.
 */
import type { Claim, AdjudicationRun } from '@/types/claim';
import type { Case, CaseEvent } from '@/types/case';
import type { TraceObject } from '@/types/trace';
import { Briefcase, Link as LinkIcon, Activity } from 'lucide-react';

interface AdjResult { claimId: string; run: AdjudicationRun; trace: TraceObject; }

interface Props {
  caseData: Case;
  events: CaseEvent[];
  claims: Claim[];
  adjResults: AdjResult[];
  currentClaimId: string;
  onSelectClaim: (id: string) => void;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export function CaseLinkingPanel({ caseData, events, claims, adjResults, currentClaimId, onSelectClaim }: Props) {
  const linked = caseData.claim_ids
    .map(id => claims.find(c => c.claim_id === id))
    .filter((c): c is Claim => !!c);

  const memberIds = new Set(linked.map(c => c.member_id));
  const providerIds = new Set(linked.map(c => c.provider_npi));
  const runs = adjResults.filter(r => caseData.claim_ids.includes(r.claimId));
  const retroEvents = events.filter(e => e.event_type === 'RETRO_TRIGGERED' || e.event_type === 'RETRO_COMPLETED');

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          Case Linking · {caseData.case_id}
        </span>
        <span className="status-cob">{caseData.status}</span>
      </div>

      <div className="p-4 grid grid-cols-4 gap-4 text-[12px] border-b">
        <KV label="Linked Claims" value={`${linked.length}`} />
        <KV label="Adjudication Runs" value={`${runs.length}`} />
        <KV label="Members" value={[...memberIds].join(', ') || '—'} mono />
        <KV label="Providers (NPI)" value={[...providerIds].join(', ') || '—'} mono />
      </div>

      <div className="divide-y">
        <div className="px-4 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground bg-muted/30 flex items-center gap-1.5">
          <LinkIcon className="h-3 w-3" /> Linked Claims & Recalc Impact
        </div>
        {linked.map(c => {
          const r = runs.find(x => x.claimId === c.claim_id);
          const isCurrent = c.claim_id === currentClaimId;
          return (
            <button
              key={c.claim_id}
              onClick={() => onSelectClaim(c.claim_id)}
              className={`w-full grid grid-cols-[140px_1fr_120px_120px_80px] gap-3 items-center px-4 py-2 text-[12px] text-left transition-colors ${isCurrent ? 'bg-accent' : 'hover:bg-muted/40'}`}
            >
              <span className="font-mono font-semibold text-foreground">{c.claim_id}</span>
              <span className="truncate text-muted-foreground">{c.provider_name}</span>
              <span className="font-mono tabular-nums text-right amount-positive">{r ? fmt(r.run.total_plan_paid) : '—'}</span>
              <span className="font-mono tabular-nums text-right amount-negative">{r ? fmt(r.run.total_member_responsibility) : '—'}</span>
              <span className="text-right text-[10.5px] font-mono text-muted-foreground">{c.status.replace(/_/g, ' ')}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Linked Claim Timeline
        </div>
        {events.length === 0 ? (
          <div className="text-[12px] text-muted-foreground italic">No case events recorded.</div>
        ) : (
          <ol className="space-y-1.5">
            {events.slice(0, 8).map(e => (
              <li key={e.event_id} className="grid grid-cols-[140px_120px_1fr] gap-3 text-[11.5px]">
                <span className="font-mono text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
                <span className="font-mono text-primary">{e.event_type}</span>
                <span className="text-foreground truncate">{e.description}</span>
              </li>
            ))}
          </ol>
        )}
        {retroEvents.length > 0 && (
          <div className="mt-3 text-[11.5px] text-status-pending font-mono">
            {retroEvents.length} retro/recalc event{retroEvents.length !== 1 ? 's' : ''} on this case.
          </div>
        )}
      </div>
    </section>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-foreground truncate ${mono ? 'font-mono text-[11.5px]' : ''}`} title={value}>{value}</div>
    </div>
  );
}
