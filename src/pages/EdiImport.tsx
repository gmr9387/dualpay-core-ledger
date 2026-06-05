/**
 * Phase 21 — EDI Import (raw 835/837 upload)
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileCheck, AlertOctagon } from 'lucide-react';
import { ingestEdiFile, isLikelyX12, type EdiIngestResult } from '@/lib/edi-gateway';
import { toast } from 'sonner';

export default function EdiImport() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('pasted.edi');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EdiIngestResult | null>(null);

  async function handleFile(f: File) {
    const content = await f.text();
    setText(content);
    setFileName(f.name);
  }

  async function submit() {
    if (!text.trim()) return;
    if (!isLikelyX12(text)) {
      toast.error('Input does not look like an X12 file (missing ISA segment).');
      return;
    }
    setBusy(true);
    try {
      const r = await ingestEdiFile({ name: fileName, content: text });
      setResult(r);
      if (r.valid) toast.success(`Parsed ${r.transaction_type} (${r.segment_count} segments)`);
      else toast.error(`Rejected: ${r.error_count} validation error(s)`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Upload className="h-6 w-6" /> EDI Import</h1>
        <p className="text-sm text-muted-foreground">Upload or paste raw X12 (835, 837P, 837I). Files are parsed, validated, and normalized.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Source File</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".edi,.x12,.835,.837,.txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="text-sm"
            />
            <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste raw X12 here (must start with ISA*...)"
            className="font-mono text-xs h-64"
          />
          <Button onClick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Processing…' : 'Parse, Validate & Normalize'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {result.valid ? <FileCheck className="h-4 w-4 text-emerald-600" /> : <AlertOctagon className="h-4 w-4 text-rose-600" />}
              Result
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Transaction: <span className="font-mono">{result.transaction_type}</span></div>
            <div>Segments: <span className="font-mono">{result.segment_count}</span></div>
            <div>Errors: <span className="font-mono">{result.error_count}</span></div>
            {result.remittances && <div>Normalized remittances: <span className="font-mono">{result.remittances.length}</span></div>}
            {result.claims && <div>Normalized claims: <span className="font-mono">{result.claims.length}</span></div>}
            {result.transaction_id && <div className="text-xs text-muted-foreground">Transaction ID: {result.transaction_id}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
