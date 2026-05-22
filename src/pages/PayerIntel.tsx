/**
 * Payer Intelligence Hub — per-payer operational profile with
 * denial mix, turnaround, appeal performance, doc requirements,
 * and a difficulty tier.
 */
import { useMemo, useState } from 'react';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { buildPayerProfiles, DIFFICULTY_CLS, type PayerProfileSummary } from '@/engine/payer-profile';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import { Loader2, Building2, FileText } from 'lucide-react';

export default function PayerIntel() {
  const { data: claims, isLoading } = useClarityData();
  const profiles = useMemo(() => (claims ? buildPayerProfiles(claims) : []), [claims]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = profiles.find(p => p.payer_id === selectedId) ?? profiles[0];

  if (isLoading || !selected) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Payer Intelligence Hub" subtitle="Operational performance per payer — denial rates, turnaround, appeal outcomes, and difficulty." />
      <ScrollBody>
        <div className="grid grid-cols-[320px_1fr] gap-4 p-5">
          <div className="space-y-2">
            {profiles.map(p => (
              <button
                key={p.payer_id}
                onClick={() => setSelectedId(p.payer_id)}
                className={`w-full text-left rounded border p-3 transition-colors ${
                  selected.payer_id === p.payer_id ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-semibold text-foreground truncate">{p.payer_name}</span>
                  <span className={`pill border ${DIFFICULTY_CLS[p.difficulty_tier]}`}>{p.difficulty_tier}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px] font-mono text-muted-foreground">
                  <span>Cl. <b className="text-foreground">{p.total_claims}</b></span>
                  <span>Den. <b className="text-status-denied">{(p.denial_rate*100).toFixed(0)}%</b></span>
                  <span>TAT <b className="text-foreground">{p.avg_turnaround_days}d</b></span>
                </div>
                <div className="mt-1 text-[10.5px] font-mono text-muted-foreground">
                  At risk <span className="amount-negative">{formatCentsCompact(p.total_at_risk_cents)}</span>
                </div>
              </button>
            ))}
          </div>

          <PayerDetail profile={selected} />
        </div>
      </ScrollBody>
    </div>
  );
}

function PayerDetail({ profile }: { profile: PayerProfileSummary }) {
  return (
    <div className="space-y-4">
      <Panel title={profile.payer_name} action={<span className={`pill border ${DIFFICULTY_CLS[profile.difficulty_tier]}`}>{profile.difficulty_tier}</span>}>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Collection rate" value={`${(profile.collection_rate * 100).toFixed(1)}%`} tone={profile.collection_rate >= 0.9 ? 'positive' : 'pending'} />
          <Stat label="Denial rate"     value={`${(profile.denial_rate * 100).toFixed(0)}%`}      tone={profile.denial_rate >= 0.3 ? 'negative' : 'neutral'} />
          <Stat label="Appeal overturn" value={`${(profile.appeal_success_rate * 100).toFixed(0)}%`} tone="positive" />
          <Stat label="Avg turnaround"  value={`${profile.avg_turnaround_days}d`} />
          <Stat label="Total billed"    value={formatCentsCompact(profile.total_billed_cents)} />
          <Stat label="Collected"       value={formatCentsCompact(profile.total_paid_cents)}   tone="positive" />
          <Stat label="At risk"         value={formatCentsCompact(profile.total_at_risk_cents)} tone="negative" />
          <Stat label="Claims tracked"  value={String(profile.total_claims)} />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Top Denial Reasons">
          {profile.top_denial_reasons.length === 0 ? (
            <div className="text-[12px] text-muted-foreground italic">No denials recorded for this payer.</div>
          ) : (
            <ul className="space-y-2">
              {profile.top_denial_reasons.map(r => (
                <li key={r.category} className="rounded border bg-muted/30 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-foreground">{CATEGORY_LABEL[r.category]}</span>
                    <span className="font-mono text-[11px] text-status-denied">{r.count}</span>
                  </div>
                  {r.sampleMessage && <div className="text-[10.5px] text-muted-foreground italic mt-0.5">"{r.sampleMessage}"</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Documentation Requirements">
          {profile.documentation_requirements.length === 0 ? (
            <div className="text-[12px] text-muted-foreground italic">No specific documentation patterns identified.</div>
          ) : (
            <ul className="space-y-1.5">
              {profile.documentation_requirements.map(d => (
                <li key={d} className="flex items-center gap-2 text-[12px] text-foreground">
                  <FileText className="h-3 w-3 text-muted-foreground" /> {d}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Difficulty Profile">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <div className="text-[12.5px] text-foreground">
              {profile.payer_name} is rated <b>{profile.difficulty_tier}</b> based on observed operational signals.
            </div>
            <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
              {profile.difficulty_drivers.map((d, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/60" /> {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'pending' | 'neutral' }) {
  const cls = tone === 'positive' ? 'amount-positive' : tone === 'negative' ? 'amount-negative'
    : tone === 'pending' ? 'text-status-pending' : 'text-foreground';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-[14px] font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
