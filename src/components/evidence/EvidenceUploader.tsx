import { useRef, useState } from 'react';
import { useOrg } from '@/hooks/use-org';
import { DOCUMENT_TYPES, isSupportedMime, type DocumentType } from '@/types/evidence';
import { uploadEvidenceDocument } from '@/lib/evidence-documents';
import { Upload, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  claim_id?: string | null;
  denial_id?: string | null;
  defaultType?: DocumentType;
  parent_document_id?: string | null;
  onUploaded?: () => void;
}

export function EvidenceUploader({ claim_id, denial_id, defaultType, parent_document_id, onUploaded }: Props) {
  const { currentOrg } = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>(defaultType ?? 'Supporting Documentation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentOrg) {
    return <div className="text-[12px] text-muted-foreground">Select an organization to upload evidence.</div>;
  }

  async function handleFile(file: File) {
    setError(null);
    if (!isSupportedMime(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Allowed: PDF, PNG, JPG, DOCX, XLSX.`);
      return;
    }
    setBusy(true);
    const res = await uploadEvidenceDocument({
      file,
      org_id: currentOrg!.org_id,
      claim_id: claim_id ?? null,
      denial_id: denial_id ?? null,
      document_type: type,
      parent_document_id: parent_document_id ?? null,
    });
    setBusy(false);
    if (!res) { setError('Upload failed — check console for details.'); return; }
    if (fileRef.current) fileRef.current.value = '';
    onUploaded?.();
  }

  return (
    <div className="border rounded-md p-3 bg-card space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11.5px] font-medium text-muted-foreground">Type</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as DocumentType)}
          className="h-7 text-[12px] rounded-md border bg-background px-2"
        >
          {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          disabled={busy}
          className="text-[12px]"
        />
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {!busy && <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {error && (
        <div className="flex items-start gap-1.5 text-[11.5px] text-status-denied">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <div className="text-[10.5px] text-muted-foreground">
        Files are versioned automatically; uploading a file with the same name and type creates a new version.
      </div>
    </div>
  );
}
