import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useEvidenceDocuments } from '@/hooks/use-evidence-documents';
import { useClarityData } from '@/hooks/use-clarity-data';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { EvidenceUploader } from '@/components/evidence/EvidenceUploader';
import { DocumentRow } from '@/components/evidence/DocumentRow';
import { Loader2 } from 'lucide-react';

export default function EvidenceDenialPage() {
  const { denialId } = useParams<{ denialId: string }>();
  const { data: docs, isLoading: docsLoading } = useEvidenceDocuments({ denial_id: denialId });
  const { data: claims, isLoading } = useClarityData();

  const match = useMemo(() => {
    if (!claims || !denialId) return null;
    for (const c of claims) {
      const d = c.intel.denial_events.find(d => d.denial_id === denialId);
      if (d) return { claim: c, denial: d };
    }
    return null;
  }, [claims, denialId]);

  if (isLoading || docsLoading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>;
  }
  if (!match) return <div className="p-6 text-[13px] text-muted-foreground">Denial {denialId} not found.</div>;

  const { claim, denial } = match;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Evidence — Denial ${denial.denial_id}`}
        subtitle={`Claim ${claim.claim_id} · CARC ${denial.carc_code} · ${denial.category}`}
      />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Upload Denial-Specific Evidence">
              <EvidenceUploader claim_id={claim.claim_id} denial_id={denial.denial_id} />
            </Panel>
            <Panel title={`Documents Linked to Denial (${docs?.length ?? 0})`} dense>
              {(docs?.length ?? 0) === 0 ? (
                <div className="p-6 text-[12px] text-muted-foreground">No documents linked to this denial yet.</div>
              ) : (
                <div className="divide-y">{docs!.map(d => <DocumentRow key={d.document_id} doc={d} />)}</div>
              )}
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Required Evidence">
              {denial.evidence_required.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No specific evidence requirements recorded.</div>
              ) : (
                <ul className="text-[12px] list-disc pl-4 space-y-1">
                  {denial.evidence_required.map(e => <li key={e}>{e}</li>)}
                </ul>
              )}
            </Panel>
            <Panel title="Links">
              <ul className="text-[12px] space-y-1">
                <li><Link to={`/vault/claim/${claim.claim_id}`} className="hover:underline">All documents for claim {claim.claim_id}</Link></li>
                <li><Link to={`/denials/${claim.claim_id}`} className="hover:underline">Denial detail</Link></li>
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
