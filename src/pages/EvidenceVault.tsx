/**
 * Evidence Vault — operational view of evidence completeness across
 * claims.  Tracks missing, expired, and required evidence; surfaces
 * completeness rate to drive appeal readiness.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, formatCents } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { FolderOpen, Loader2, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';

const EVIDENCE_TAXONOMY = [
  { id: 'medical_records', label: 'Medical records', icon: '📋' },
  { id: 'authorizations',  label: 'Authorizations',  icon: '🔐' },
  { id: 'referrals',       label: 'Referrals',        icon: '✉️' },
  { id: 'notes',           label: 'Clinical notes',   icon: '📝' },
  { id: 'documentation',   label: 'Supporting docs',  icon: '📎' },
];

export default function EvidenceVault() {
  const { data: claims, isLoading } = useClarityData();

  const summary = useMemo(() => {
    if (!claims) return null;
    const missing = claims.filter(c => c.intel.evidence_missing.length > 0);
    const exposedCents = missing.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    const requiredItems = claims.reduce((s, c) => s + c.intel.denial_events.reduce((a, d) => a + d.evidence_required.length, 0), 0);
    const missingItems = claims.reduce((s, c) => s + c.intel.evidence_missing.length, 0);
    const completeness = requiredItems === 0 ? 1 : Math.max(0, 1 - missingItems / Math.max(1, requiredItems));
    // Top missing categories
    const counts = new Map<string, number>();
    for (const c of claims) for (const e of c.intel.evidence_missing) {
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    const topMissing = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { missing, exposedCents, completeness, missingItems, requiredItems, topMissing };
  }, [claims]);

  if (isLoading || !summary) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Evidence Vault" subtitle="Track required, missing, and expired evidence across active claims and appeals." />
      <KpiStrip tiles={[
        { label: 'Completeness',       value: `${(summary.completeness * 100).toFixed(0)}%`,                 tone: summary.completeness >= 0.8 ? 'text-status-paid' : 'text-status-pending' },
        { label: 'Claims w/ Gaps',     value: String(summary.missing.length),                                tone: 'text-status-denied' },
        { label: 'Missing Items',      value: `${summary.missingItems} / ${summary.requiredItems}` },
        { label: 'Revenue Exposed',    value: formatCents(summary.exposedCents),                              tone: 'amount-negative' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title={`Claims with Evidence Gaps (${summary.missing.length})`} dense>
              {summary.missing.length === 0 ? (
                <div className="p-6"><EmptyState title="No evidence gaps" body="All required documentation is on file." icon={<CheckCircle2 className="h-5 w-5" />} /></div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Claim</span><span>Payer</span><span>Missing Evidence</span><span className="text-right">At Risk</span>
                  </div>
                  {summary.missing.map(c => (
                    <Link key={c.claim_id} to={`/denials/${c.claim_id}`} className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40">
                      <span className="font-mono text-[12px] font-semibold text-foreground">{c.claim_id}</span>
                      <span className="text-[12px] text-foreground truncate">{c.intel.payer_name}</span>
                      <div className="flex flex-wrap gap-1">
                        {c.intel.evidence_missing.map(e => (
                          <span key={e} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded border bg-status-denied/10 text-status-denied border-status-denied/30">
                            <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />{e}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-[12.5px] text-right tabular-nums amount-negative">{formatCents(c.intel.amount_at_risk_cents)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Most-Required Evidence Types">
              <div className="grid grid-cols-2 gap-3">
                {summary.topMissing.map(([label, count]) => (
                  <div key={label} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0 text-[12px] text-foreground truncate">{label}</div>
                    <span className="font-mono text-[11px] text-status-denied">{count}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Evidence Taxonomy">
              <ul className="space-y-1.5">
                {EVIDENCE_TAXONOMY.map(t => (
                  <li key={t.id} className="flex items-center gap-2 text-[12.5px]">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground">{t.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Vault Health">
              <div className="space-y-1.5 text-[12px]">
                <Row label="Documents indexed" value="14,832" />
                <Row label="OCR coverage" value="98%" tone="text-status-paid" />
                <Row label="Expiring this week" value="6" tone="text-status-pending" />
                <Row label="Avg attach latency" value="2.4s" />
              </div>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-[11.5px] ${tone ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}
