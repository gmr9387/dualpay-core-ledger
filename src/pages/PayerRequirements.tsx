/**
 * Payer Requirement Profiles — surfaces appeal deadlines, submission
 * channels, documentation expectations, and overturn rates per payer.
 */
import { useMemo, useState } from 'react';
import { useClarityData } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { buildPayerRequirements } from '@/engine/payer-requirements';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import { Loader2, Building2, Clock, FileText, Mail, Send } from 'lucide-react';

export default function PayerRequirements() {
  const { data: claims, isLoading } = useClarityData();
  const reqs = useMemo(() => claims ? buildPayerRequirements(claims) : [], [claims]);
  const [active, setActive] = useState<string | undefined>(undefined);
  const sel = reqs.find(r => r.payer_id === active) ?? reqs[0];

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  const avgL1 = reqs.length ? Math.round(reqs.reduce((s, r) => s + r.appeal_deadlines.level_1_days, 0) / reqs.length) : 0;
  const avgFiling = reqs.length ? Math.round(reqs.reduce((s, r) => s + r.timely_filing_days, 0) / reqs.length) : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Payer Requirement Profiles" subtitle="Appeal windows, submission channels, documentation expectations, and overturn rates." />
      <KpiStrip tiles={[
        { label: 'Payers Profiled',  value: String(reqs.length) },
        { label: 'Avg Level 1 Window', value: `${avgL1}d` },
        { label: 'Avg Timely Filing',  value: `${avgFiling}d` },
        { label: 'Portal-Preferred',   value: String(reqs.filter(r => r.submission_channels.find(c => c.preferred)?.channel === 'portal').length) },
      ]} />
      <ScrollBody>
        {reqs.length === 0 ? (
          <EmptyState title="No payers" body="Ingest claims to derive requirements." icon={<Building2 className="h-5 w-5" />} />
        ) : (
          <div className="grid grid-cols-[300px_1fr] h-full">
            <div className="border-r bg-card overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">Payers</div>
              {reqs.map(r => {
                const isActive = sel?.payer_id === r.payer_id;
                return (
                  <button key={r.payer_id} onClick={() => setActive(r.payer_id)}
                    className={`w-full text-left px-3 py-2.5 border-b text-[12.5px] ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}>
                    <div className="font-medium text-foreground truncate">{r.payer_name}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground uppercase">
                      {r.payer_class} · L1 {r.appeal_deadlines.level_1_days}d · {Math.round(r.overturn_rate * 100)}% overturn
                    </div>
                  </button>
                );
              })}
            </div>
            {sel && (
              <div className="p-5 space-y-4 overflow-y-auto">
                <Panel title={`${sel.payer_name} · ${sel.payer_class.toUpperCase()}`}>
                  <div className="grid grid-cols-4 gap-3">
                    <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Timely Filing" value={`${sel.timely_filing_days}d`} />
                    <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Level 1 Appeal" value={`${sel.appeal_deadlines.level_1_days}d`} />
                    <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Level 2 Appeal" value={`${sel.appeal_deadlines.level_2_days}d`} />
                    <Tile icon={<Clock className="h-3.5 w-3.5" />} label="External Review" value={`${sel.appeal_deadlines.external_review_days}d`} />
                  </div>
                </Panel>

                <div className="grid grid-cols-2 gap-4">
                  <Panel title="Submission Channels">
                    <ul className="space-y-1.5 text-[12.5px]">
                      {sel.submission_channels.map((c, i) => (
                        <li key={i} className="flex items-center gap-2">
                          {c.channel === 'portal' ? <Send className="h-3.5 w-3.5 text-primary" />
                           : c.channel === 'fax' ? <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                           : c.channel === 'mail' ? <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                           : <Send className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-foreground capitalize">{c.channel.replace('_', ' ')}</span>
                          {c.preferred && <span className="pill border bg-status-paid/10 text-status-paid border-status-paid/30">preferred</span>}
                          {c.address && <span className="text-[11px] text-muted-foreground ml-auto">{c.address}</span>}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                  <Panel title="Documentation Expectations">
                    <ul className="space-y-1 text-[12px]">
                      {sel.documentation_expectations.map(e => (
                        <li key={e} className="flex items-start gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" /><span className="text-foreground">{e}</span></li>
                      ))}
                    </ul>
                  </Panel>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Panel title="Common Denial Causes">
                    {sel.common_denial_causes.length === 0 ? (
                      <div className="text-[12px] text-muted-foreground italic">No observed denials.</div>
                    ) : (
                      <ul className="space-y-1 text-[12px]">
                        {sel.common_denial_causes.map(c => (
                          <li key={c} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-status-denied" />
                            <span className="text-foreground">{CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                  <Panel title="Historical Overturn Rate">
                    <div className="text-[28px] font-mono font-semibold text-foreground">{Math.round(sel.overturn_rate * 100)}%</div>
                    <div className="text-[11.5px] text-muted-foreground">Of appeals decided to date against {sel.payer_name}.</div>
                  </Panel>
                </div>

                {sel.notes.length > 0 && (
                  <Panel title="Operational Notes">
                    <ul className="space-y-1.5 text-[12px]">
                      {sel.notes.map((n, i) => <li key={i} className="text-muted-foreground">{n}</li>)}
                    </ul>
                  </Panel>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollBody>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="text-[18px] font-mono font-semibold text-foreground mt-1">{value}</div>
    </div>
  );
}
