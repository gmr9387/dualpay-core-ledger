/**
 * Outcome Log — log and edit terminal claim outcomes.
 *
 * Phase 5 captures the ground truth that feeds Recovery
 * Intelligence.  Deterministic UI: outcomes can be added, edited,
 * deleted; analytics recompute live.
 */
import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';
import { PageHeader, ScrollBody, Panel, KpiStrip } from '@/components/clarity/primitives';
import { useOutcomes } from '@/hooks/use-outcomes';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { upsertOutcome, deleteOutcome, resetOutcomes } from '@/lib/outcomes';
import { explainRecoverability } from '@/engine/recoverability';
import { RESOLUTION_LABEL, RECOVERED_RESOLUTIONS, type ResolutionType, type RecoveryOutcome } from '@/types/outcomes';
import { headlineMetrics } from '@/engine/outcome-analytics';

export default function OutcomeLog() {
  const { outcomes, loading } = useOutcomes();
  const { data: claims } = useClarityData();
  const [showAdd, setShowAdd] = useState(false);

  const m = useMemo(() => headlineMetrics(outcomes), [outcomes]);

  if (loading || !claims) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Outcome Log"
        subtitle="Ground truth that feeds Recovery Intelligence. Edit or add resolved claim outcomes."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => { if (confirm('Re-derive outcomes from current claim states? This clears manual edits.')) resetOutcomes(); }}
              className="text-[12px] px-3 h-8 inline-flex items-center gap-1.5 rounded-md border bg-card hover:bg-muted">
              <RefreshCw className="h-3.5 w-3.5" /> Re-derive
            </button>
            <button onClick={() => setShowAdd(s => !s)}
              className="text-[12px] px-3 h-8 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Log Outcome
            </button>
          </div>
        }
      />

      <KpiStrip tiles={[
        { label: 'Outcomes Logged',     value: String(m.outcome_count) },
        { label: 'Total Denied',        value: formatCentsCompact(m.total_denied_cents) },
        { label: 'Total Recovered',     value: formatCentsCompact(m.total_recovered_cents), tone: 'amount-positive' },
        { label: 'Recovery Rate',       value: `${(m.recovery_rate * 100).toFixed(1)}%` },
        { label: 'Appeal Win Rate',     value: `${(m.appeal_success_rate * 100).toFixed(0)}%`, tone: 'text-status-cob' },
        { label: 'Avg Days',            value: `${m.avg_days_to_resolution.toFixed(0)}d` },
      ]} />

      <ScrollBody>
        <div className="p-5 space-y-4">
          {showAdd && <AddOutcomeForm claims={claims} onClose={() => setShowAdd(false)} />}

          <Panel title={`Logged Outcomes (${outcomes.length})`} dense>
            {outcomes.length === 0 ? (
              <div className="p-8 text-center text-[12.5px] text-muted-foreground">
                No outcomes logged. Use <b>Log Outcome</b> or <b>Re-derive</b> to seed from current claim states.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 border-b">
                  <tr className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-3 py-2 font-semibold">Claim</th>
                    <th className="text-left px-3 py-2 font-semibold">Payer</th>
                    <th className="text-left px-3 py-2 font-semibold">Resolution</th>
                    <th className="text-right px-3 py-2 font-semibold">Denied</th>
                    <th className="text-right px-3 py-2 font-semibold">Recovered</th>
                    <th className="text-right px-3 py-2 font-semibold">Score / Actual</th>
                    <th className="text-right px-3 py-2 font-semibold">Days</th>
                    <th className="text-right px-3 py-2 font-semibold w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map(o => (
                    <OutcomeRow key={o.outcome_id} o={o} />
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}

function OutcomeRow({ o }: { o: RecoveryOutcome }) {
  const recovered = RECOVERED_RESOLUTIONS.includes(o.resolution_type);
  const actualRate = o.denied_amount_cents ? o.recovered_amount_cents / o.denied_amount_cents : 0;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-3 py-2 font-mono text-foreground">{o.claim_id}</td>
      <td className="px-3 py-2 text-foreground truncate max-w-[160px]">{o.payer_name}</td>
      <td className="px-3 py-2">
        <span className={`pill border ${recovered ? 'bg-status-paid/10 text-status-paid border-status-paid/30' : 'bg-status-denied/10 text-status-denied border-status-denied/30'}`}>
          {RESOLUTION_LABEL[o.resolution_type]}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">{formatCents(o.denied_amount_cents)}</td>
      <td className={`px-3 py-2 text-right font-mono tabular-nums ${recovered ? 'amount-positive' : 'text-muted-foreground'}`}>{formatCents(o.recovered_amount_cents)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
        {o.predicted_recoverability_score} → {(actualRate * 100).toFixed(0)}%
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{o.days_to_resolution}d</td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => { if (confirm('Delete outcome?')) deleteOutcome(o.outcome_id); }}
          className="text-muted-foreground hover:text-status-denied">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function AddOutcomeForm({ claims, onClose }: { claims: Array<{ claim_id: string; intel: { payer_id: string; payer_name: string; denial_events: Array<{ denial_id: string; category: string; amount_cents: number; occurred_at: string }>; workflow_owner: string } }>; onClose: () => void }) {
  const [claimId, setClaimId] = useState('');
  const [resolution, setResolution] = useState<ResolutionType>('recovered_full');
  const [recovered, setRecovered] = useState('0');
  const claim = claims.find(c => c.claim_id === claimId);

  function submit() {
    if (!claim) return;
    const primary = claim.intel.denial_events[0];
    const denied = primary?.amount_cents ?? 0;
    const recoveredCents = Math.max(0, Math.round(parseFloat(recovered || '0') * 100));
    const now = new Date().toISOString();
    const predicted = explainRecoverability(claim as never).score;
    upsertOutcome({
      outcome_id: `OUT-${claim.claim_id}-MANUAL-${Date.now()}`,
      claim_id: claim.claim_id,
      denial_id: primary?.denial_id,
      payer_id: claim.intel.payer_id,
      payer_name: claim.intel.payer_name,
      category: (primary?.category ?? 'contractual') as never,
      workflow_owner: claim.intel.workflow_owner as never,
      playbook_used: (primary?.category ?? 'contractual') as never,
      resolution_type: resolution,
      denied_amount_cents: denied,
      recovered_amount_cents: Math.min(recoveredCents, denied),
      unrecovered_amount_cents: Math.max(0, denied - recoveredCents),
      denial_date: primary?.occurred_at ?? now,
      resolution_date: now,
      days_to_resolution: primary ? Math.max(0, Math.round((Date.now() - new Date(primary.occurred_at).getTime()) / 86_400_000)) : 0,
      predicted_recoverability_score: predicted,
      created_at: now,
      updated_at: now,
    });
    onClose();
  }

  return (
    <Panel title="Log New Outcome">
      <div className="grid grid-cols-4 gap-3">
        <Field label="Claim">
          <select value={claimId} onChange={e => setClaimId(e.target.value)} className="w-full h-8 px-2 text-[12px] rounded border bg-card">
            <option value="">Select claim…</option>
            {claims.filter(c => c.intel.denial_events.length > 0).map(c => (
              <option key={c.claim_id} value={c.claim_id}>{c.claim_id} — {c.intel.payer_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Resolution">
          <select value={resolution} onChange={e => setResolution(e.target.value as ResolutionType)} className="w-full h-8 px-2 text-[12px] rounded border bg-card">
            {Object.entries(RESOLUTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Recovered ($)">
          <input type="number" step="0.01" value={recovered} onChange={e => setRecovered(e.target.value)} className="w-full h-8 px-2 text-[12px] rounded border bg-card font-mono" />
        </Field>
        <div className="flex items-end gap-2">
          <button onClick={submit} disabled={!claim} className="flex-1 h-8 text-[12px] rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90">Log</button>
          <button onClick={onClose} className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted">Cancel</button>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
