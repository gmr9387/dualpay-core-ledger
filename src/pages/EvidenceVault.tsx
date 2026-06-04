/**
 * Evidence Vault — primary document management surface.
 * Shows uploaded documents across the organization with search, type
 * filter, and upload. Existing evidence-readiness summary is preserved
 * via the per-claim deep links.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvidenceDocuments } from '@/hooks/use-evidence-documents';
import { useClarityData, formatCents } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { EvidenceUploader } from '@/components/evidence/EvidenceUploader';
import { DocumentRow } from '@/components/evidence/DocumentRow';
import { DOCUMENT_TYPES, type DocumentType } from '@/types/evidence';
import { FolderOpen, Loader2, Search } from 'lucide-react';

export default function EvidenceVault() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<DocumentType | ''>('');
  const { data: docs, isLoading } = useEvidenceDocuments({
    search: search || undefined,
    document_type: (type || undefined) as DocumentType | undefined,
  });
  const { data: claims } = useClarityData();

  const summary = useMemo(() => {
    if (!claims) return null;
    const missing = claims.filter(c => c.intel.evidence_missing.length > 0);
    const exposedCents = missing.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
    return { missing, exposedCents };
  }, [claims]);

  const totalBytes = (docs ?? []).reduce((s, d) => s + (d.file_size || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Evidence Vault"
        subtitle="Upload, link, and version supporting documents across claims and appeals."
      />
      <KpiStrip tiles={[
        { label: 'Documents',          value: String(docs?.length ?? 0) },
        { label: 'Storage Used',        value: `${(totalBytes / (1024 * 1024)).toFixed(2)} MB` },
        { label: 'Claims w/ Gaps',      value: String(summary?.missing.length ?? 0), tone: 'text-status-denied' },
        { label: 'Revenue Exposed',     value: formatCents(summary?.exposedCents ?? 0), tone: 'amount-negative' },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Upload Document">
              <EvidenceUploader />
            </Panel>

            <Panel title={`Documents (${docs?.length ?? 0})`} dense>
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search filename…"
                    className="w-full h-7 pl-7 pr-2 text-[12px] rounded-md bg-card border"
                  />
                </div>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as DocumentType | '')}
                  className="h-7 text-[12px] rounded-md border bg-card px-2"
                >
                  <option value="">All types</option>
                  {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {isLoading ? (
                <div className="p-6 flex items-center justify-center text-muted-foreground text-[12px]">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : (docs?.length ?? 0) === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No documents yet"
                    body="Upload evidence to begin building your appeal packets."
                    icon={<FolderOpen className="h-5 w-5" />}
                  />
                </div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[24px_1fr_120px_80px_60px_90px_120px_auto] gap-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <span /><span>Filename</span><span>Type</span><span>Format</span><span>Ver</span><span className="text-right">Size</span><span>Claim</span><span className="text-right">Actions</span>
                  </div>
                  {docs!.map(d => <DocumentRow key={d.document_id} doc={d} />)}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Claims with Evidence Gaps">
              {(summary?.missing ?? []).length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No gaps detected.</div>
              ) : (
                <ul className="space-y-1">
                  {summary!.missing.slice(0, 10).map(c => (
                    <li key={c.claim_id}>
                      <Link to={`/vault/claim/${c.claim_id}`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-[12px]">
                        <span className="font-mono">{c.claim_id}</span>
                        <span className="text-status-denied font-mono text-[11px]">{c.intel.evidence_missing.length} missing</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Document Types">
              <ul className="space-y-1 text-[12px]">
                {DOCUMENT_TYPES.map(t => {
                  const count = (docs ?? []).filter(d => d.document_type === t).length;
                  return (
                    <li key={t} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t}</span>
                      <span className="font-mono text-[11px] text-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
