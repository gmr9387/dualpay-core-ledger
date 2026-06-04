import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { EvidenceDocument } from '@/types/evidence';
import { deleteEvidenceDocument, getSignedUrl } from '@/lib/evidence-documents';
import { useOrg } from '@/hooks/use-org';
import { FileText, Download, Trash2, ExternalLink } from 'lucide-react';

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/jpg': 'JPG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

export function DocumentRow({ doc }: { doc: EvidenceDocument }) {
  const { currentOrg } = useOrg();
  const role = currentOrg?.role;
  const canDelete = role === 'owner' || role === 'admin' || role === 'manager';
  const [busy, setBusy] = useState(false);

  async function download() {
    const url = await getSignedUrl(doc, 600);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function remove() {
    if (!confirm(`Delete "${doc.filename}" (v${doc.version})? This removes the file from storage.`)) return;
    setBusy(true);
    await deleteEvidenceDocument(doc.document_id);
    setBusy(false);
  }

  return (
    <div className="grid grid-cols-[24px_1fr_120px_80px_60px_90px_120px_auto] gap-3 items-center px-3 py-2 border-b text-[12px] hover:bg-muted/40">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <Link to={`/vault/${doc.document_id}`} className="font-medium text-foreground truncate hover:underline block">
          {doc.filename}
        </Link>
        {doc.notes && <div className="text-[10.5px] text-muted-foreground truncate">{doc.notes}</div>}
      </div>
      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border bg-muted/50 truncate">{doc.document_type}</span>
      <span className="text-[10.5px] font-mono text-muted-foreground">{MIME_LABEL[doc.mime_type] ?? '—'}</span>
      <span className="text-[10.5px] font-mono text-muted-foreground">v{doc.version}</span>
      <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">{(doc.file_size / 1024).toFixed(1)} KB</span>
      <span className="text-[10.5px] text-muted-foreground truncate">
        {doc.claim_id ? <Link to={`/vault/claim/${doc.claim_id}`} className="hover:underline">{doc.claim_id}</Link> : '—'}
      </span>
      <div className="flex items-center gap-1 justify-end">
        <button onClick={download} className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center" title="Download">
          <Download className="h-3.5 w-3.5" />
        </button>
        <Link to={`/vault/${doc.document_id}`} className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center" title="Details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {canDelete && (
          <button onClick={remove} disabled={busy} className="h-7 w-7 rounded hover:bg-status-denied/10 text-status-denied flex items-center justify-center" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
