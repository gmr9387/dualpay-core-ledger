import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEvidenceDocument, getSignedUrl, linkEvidenceToDenial } from '@/lib/evidence-documents';
import { useClarityData } from '@/hooks/use-clarity-data';
import { useOpsEvents } from '@/hooks/use-ops-events';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { Loader2, Download, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

export default function EvidenceDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { data: doc, isLoading, refetch } = useQuery({
    queryKey: ['evidence-doc', documentId],
    queryFn: () => getEvidenceDocument(documentId!),
    enabled: !!documentId,
  });
  const { data: claims } = useClarityData();
  const { events } = useOpsEvents();
  const [linking, setLinking] = useState(false);

  if (isLoading || !doc) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>;
  }

  const claim = claims?.find(c => c.claim_id === doc.claim_id);
  const denials = claim?.intel.denial_events ?? [];
  const docEvents = events.filter(e => (e.payload as { document_id?: string } | null)?.document_id === doc.document_id);

  async function download() {
    const url = await getSignedUrl(doc!, 600);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function changeDenial(denial_id: string) {
    setLinking(true);
    await linkEvidenceToDenial(doc!.document_id, denial_id || null);
    await refetch();
    setLinking(false);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={doc.filename}
        subtitle={`${doc.document_type} · v${doc.version} · ${(doc.file_size / 1024).toFixed(1)} KB`}
        actions={
          <>
            <Link to="/vault" className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Vault
            </Link>
            <button onClick={download} className="h-8 px-3 text-[12px] rounded-md bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </>
        }
      />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Document">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <Row label="Filename" value={doc.filename} />
                <Row label="Type" value={doc.document_type} />
                <Row label="MIME" value={doc.mime_type} />
                <Row label="Size" value={`${(doc.file_size / 1024).toFixed(1)} KB`} />
                <Row label="Version" value={`v${doc.version}`} />
                <Row label="Uploaded" value={doc.uploaded_at} />
                <Row label="Uploaded By" value={doc.uploaded_by_email ?? '—'} />
                <Row label="Parent" value={doc.parent_document_id ?? '—'} />
                <Row label="Claim" value={doc.claim_id ?? '—'} />
                <Row label="Denial" value={doc.denial_id ?? '—'} />
              </dl>
              {doc.notes && (
                <div className="mt-3 text-[12px]">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</div>
                  <div>{doc.notes}</div>
                </div>
              )}
            </Panel>

            {denials.length > 0 && (
              <Panel title="Link to Denial">
                <select
                  value={doc.denial_id ?? ''}
                  onChange={e => changeDenial(e.target.value)}
                  disabled={linking}
                  className="h-8 text-[12px] rounded-md border bg-card px-2 w-full"
                >
                  <option value="">— Not linked —</option>
                  {denials.map(d => (
                    <option key={d.denial_id} value={d.denial_id}>
                      {d.denial_id} · CARC {d.carc_code} · {d.category}
                    </option>
                  ))}
                </select>
              </Panel>
            )}
          </div>

          <div className="space-y-4">
            <Panel title="Audit Trail">
              {docEvents.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No events recorded.</div>
              ) : (
                <ul className="space-y-1.5 text-[11.5px]">
                  {docEvents.map(e => (
                    <li key={e.event_id} className="border-l-2 border-primary/40 pl-2">
                      <div className="font-mono text-[10.5px] text-muted-foreground">{e.occurred_at}</div>
                      <div className="font-medium">{e.kind}</div>
                      <div className="text-muted-foreground">{e.summary}</div>
                      {e.actor_email && <div className="text-[10.5px] text-muted-foreground">{e.actor_email}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {doc.claim_id && (
              <Panel title="Quick Links">
                <ul className="text-[12px] space-y-1">
                  <li><Link to={`/vault/claim/${doc.claim_id}`} className="hover:underline">All documents for {doc.claim_id}</Link></li>
                  <li><Link to={`/denials/${doc.claim_id}`} className="hover:underline">Denial detail</Link></li>
                  <li><Link to={`/packet/${doc.claim_id}`} className="hover:underline">Appeal packet</Link></li>
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[11.5px] truncate">{value}</dd>
    </>
  );
}
