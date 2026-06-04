import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useEvidenceDocuments } from '@/hooks/use-evidence-documents';
import { useClarityData } from '@/hooks/use-clarity-data';
import { scoreEvidenceReadiness, READINESS_CLS, READINESS_LABEL } from '@/engine/evidence-readiness';
import { generateAppealPacket } from '@/engine/appeal-packet-generator';
import { uploadAppealPacket } from '@/lib/evidence-documents';
import { appendOpsEvent } from '@/lib/ops-events';
import { useOrg } from '@/hooks/use-org';
import { PageHeader, ScrollBody, Panel, KpiStrip } from '@/components/clarity/primitives';
import { EvidenceUploader } from '@/components/evidence/EvidenceUploader';
import { DocumentRow } from '@/components/evidence/DocumentRow';
import { CheckCircle2, AlertTriangle, Loader2, FileDown } from 'lucide-react';
import { useState } from 'react';

export default function EvidenceClaimPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const { currentOrg } = useOrg();
  const { data: docs, isLoading: docsLoading } = useEvidenceDocuments({ claim_id: claimId });
  const { data: claims, isLoading } = useClarityData();
  const [packetStatus, setPacketStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const claim = useMemo(() => claims?.find(c => c.claim_id === claimId), [claims, claimId]);

  if (isLoading || docsLoading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>;
  }
  if (!claim) {
    return <div className="p-6 text-[13px] text-muted-foreground">Claim {claimId} not found.</div>;
  }

  const readiness = scoreEvidenceReadiness(claim, claims!);

  async function generate() {
    if (!currentOrg || !claim) return;
    setBusy(true);
    setPacketStatus(null);
    const packet = generateAppealPacket(claim, claims!, docs ?? []);
    const blob = new Blob([packet.markdown], { type: 'text/markdown' });
    const filename = `appeal_packet_${claim.claim_id}_${Date.now()}.md`;
    const upload = await uploadAppealPacket({
      org_id: currentOrg.org_id,
      claim_id: claim.claim_id,
      filename,
      content: blob,
    });
    await appendOpsEvent({
      kind: 'appeal_packet_generated' as never,
      claim_id: claim.claim_id,
      summary: packet.complete
        ? `Appeal packet generated (${packet.readiness_tier} ${packet.readiness_score}%)`
        : `Appeal packet INCOMPLETE — ${packet.blocking_items.length} blocking gap(s)`,
      payload: { complete: packet.complete, readiness_tier: packet.readiness_tier, blocking: packet.blocking_items, storage_path: upload?.path ?? null },
    });
    // Trigger local download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
    setPacketStatus(packet.complete ? `Packet generated and stored.` : `Packet generated but flagged INCOMPLETE.`);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Evidence — ${claim.claim_id}`}
        subtitle={`${claim.intel.payer_name} · ${claim.intel.reimbursement_state}`}
        actions={
          <button onClick={generate} disabled={busy} className="h-8 px-3 text-[12px] rounded-md bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Generate Appeal Packet
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Readiness', value: `${READINESS_LABEL[readiness.tier]} (${readiness.score}%)` },
        { label: 'Items Present', value: `${readiness.items_present}/${readiness.items_required}` },
        { label: 'Blocking Gaps', value: String(readiness.blocking_items.length), tone: readiness.blocking_items.length ? 'text-status-denied' : 'text-status-paid' },
        { label: 'Documents', value: String(docs?.length ?? 0) },
      ]} />
      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Upload Evidence">
              <EvidenceUploader claim_id={claim.claim_id} />
            </Panel>

            <Panel title={`Documents on File (${docs?.length ?? 0})`} dense>
              {(docs?.length ?? 0) === 0 ? (
                <div className="p-6 text-[12px] text-muted-foreground">No documents linked to this claim yet.</div>
              ) : (
                <div className="divide-y">
                  {docs!.map(d => <DocumentRow key={d.document_id} doc={d} />)}
                </div>
              )}
            </Panel>

            {packetStatus && (
              <div className="p-3 border rounded-md bg-muted/40 text-[12px] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-status-paid" /> {packetStatus}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Panel title="Evidence Readiness">
              <div className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded border ${READINESS_CLS[readiness.tier]}`}>
                {READINESS_LABEL[readiness.tier]} · {readiness.score}%
              </div>
              <div className="mt-3 space-y-1.5 text-[12px]">
                {readiness.items_satisfied.map(i => (
                  <div key={i.label} className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-status-paid" /><span>{i.label}</span></div>
                ))}
                {readiness.items_missing.map(i => (
                  <div key={i.label} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-status-denied" /><span>{i.label}{i.blocking ? ' (blocking)' : ''}</span></div>
                ))}
              </div>
            </Panel>
            <Panel title="Links">
              <ul className="text-[12px] space-y-1">
                <li><Link to={`/denials/${claim.claim_id}`} className="hover:underline">Denial detail</Link></li>
                <li><Link to={`/packet/${claim.claim_id}`} className="hover:underline">Appeal packet view</Link></li>
                {claim.intel.denial_events[0] && (
                  <li><Link to={`/vault/denial/${claim.intel.denial_events[0].denial_id}`} className="hover:underline">Documents for denial {claim.intel.denial_events[0].denial_id}</Link></li>
                )}
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
