import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Panel, ScrollBody } from '@/components/clarity/primitives';
import { parseFile, type ParsedFile } from '@/lib/file-parser';
import { autoDetectMapping, CANONICAL_FIELDS, REQUIRED_BY_SOURCE } from '@/engine/import-schema';
import { validateRows } from '@/engine/import-validation';
import { createBatch, commitBatch } from '@/lib/import-batches';
import type {
  CanonicalField,
  FieldMapping,
  ImportSourceType,
  ParsedRow,
  ValidationSummary,
} from '@/types/import';
import { SOURCE_LABEL } from '@/types/import';
import { Upload, AlertCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCentsCompact } from '@/hooks/use-clarity-data';

type Step = 'upload' | 'map' | 'validate' | 'review';

export default function ImportCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('upload');
  const [source, setSource] = useState<ImportSourceType>('denial_export');

  useEffect(() => {
    const s = searchParams.get('source') as ImportSourceType | null;
    if (s && (['denial_export','aging_report','underpayment_report','appeal_status','payer_followup','remittance_835'] as ImportSourceType[]).includes(s)) {
      setSource(s);
    }
  }, [searchParams]);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [committing, setCommitting] = useState(false);

  async function handleFile(f: File) {
    setFile(f);
    try {
      const p = await parseFile(f);
      if (p.rows.length === 0) {
        toast.error('No rows found in file.');
        return;
      }
      setParsed(p);
      setMapping(autoDetectMapping(p.headers));
      setStep('map');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function runValidate() {
    if (!parsed) return;
    const { parsed: validated, summary: s } = validateRows(parsed.rows, mapping, source);
    setRows(validated);
    setSummary(s);
    setStep('validate');
  }

  async function commit() {
    if (!parsed || !summary || !file) return;
    setCommitting(true);
    try {
      const batch = await createBatch({ file_name: file.name, source_type: source, mapping, validation: summary });
      const { committed: n, expected_recovery_cents } = await commitBatch(batch, rows, source);
      toast.success(`Imported ${n} claims · ${formatCentsCompact(expected_recovery_cents)} expected recovery`);
      setStep('review');
    } catch (e) {
      toast.error('Commit failed: ' + (e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setStep('upload'); setFile(null); setParsed(null); setMapping({}); setRows([]); setSummary(null);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Import Center"
        subtitle="Drag & drop a CSV or XLSX export → map columns → validate → commit through the intelligence engines."
        actions={
          <button onClick={() => navigate('/factory')} className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted">
            ← Back to Factory
          </button>
        }
      />
      <Stepper step={step} />
      <ScrollBody>
        <div className="p-5">
          {step === 'upload' && (
            <UploadStep source={source} setSource={setSource} onFile={handleFile} />
          )}
          {step === 'map' && parsed && (
            <MapStep
              source={source}
              parsed={parsed}
              mapping={mapping}
              setMapping={setMapping}
              onBack={reset}
              onNext={runValidate}
            />
          )}
          {step === 'validate' && summary && (
            <ValidateStep
              source={source}
              file={file!}
              summary={summary}
              rows={rows}
              committing={committing}
              onBack={() => setStep('map')}
              onCommit={commit}
            />
          )}
          {step === 'review' && summary && (
            <ReviewStep summary={summary} fileName={file?.name ?? ''} onAnother={reset} />
          )}
        </div>
      </ScrollBody>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: '1. Upload' },
    { id: 'map', label: '2. Map Fields' },
    { id: 'validate', label: '3. Validate' },
    { id: 'review', label: '4. Review' },
  ];
  const activeIdx = steps.findIndex(s => s.id === step);
  return (
    <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-card">
      {steps.map((s, i) => (
        <span key={s.id} className="flex items-center gap-2">
          <span className={`text-[11.5px] font-mono font-semibold px-2 py-0.5 rounded ${
            i === activeIdx ? 'bg-primary text-primary-foreground'
              : i < activeIdx ? 'bg-status-paid/15 text-status-paid border border-status-paid/30'
              : 'bg-muted text-muted-foreground'
          }`}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
        </span>
      ))}
    </div>
  );
}

function UploadStep({ source, setSource, onFile }: {
  source: ImportSourceType; setSource: (s: ImportSourceType) => void; onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Panel title="1. Choose Import Type">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SOURCE_LABEL) as ImportSourceType[]).map(s => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`text-left px-3 py-2.5 rounded-md border text-[12px] transition-colors ${
                source === s ? 'bg-primary/10 border-primary text-foreground' : 'bg-card border-border hover:bg-muted/60'
              }`}
            >
              <div className="font-semibold">{SOURCE_LABEL[s]}</div>
              <div className="text-[10.5px] text-muted-foreground mt-0.5">
                Required: {REQUIRED_BY_SOURCE[s].join(', ')}
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="2. Upload File">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files[0]; if (f) onFile(f);
          }}
          className={`border-2 border-dashed rounded-md py-12 text-center transition-colors ${
            drag ? 'border-primary bg-primary/5' : 'border-border'
          }`}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <div className="text-[13px] font-medium text-foreground">Drag &amp; drop CSV or XLSX</div>
          <div className="text-[11.5px] text-muted-foreground mt-1">or</div>
          <label className="mt-2 inline-block">
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <span className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
              Browse files
            </span>
          </label>
        </div>
      </Panel>
    </div>
  );
}

function MapStep({ source, parsed, mapping, setMapping, onBack, onNext }: {
  source: ImportSourceType; parsed: ParsedFile; mapping: FieldMapping;
  setMapping: (m: FieldMapping) => void; onBack: () => void; onNext: () => void;
}) {
  const required = REQUIRED_BY_SOURCE[source];
  const missingReq = required.filter(r => !mapping[r]);
  const headerOpts = ['', ...parsed.headers];

  return (
    <div className="space-y-4">
      <Panel title={`Field Mapping — ${SOURCE_LABEL[source]} (${parsed.rows.length} rows)`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {CANONICAL_FIELDS.map(f => {
            const isReq = required.includes(f.key);
            const mapped = mapping[f.key];
            return (
              <div key={f.key} className="flex items-center gap-3 text-[12px]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">
                    {f.label} {isReq && <span className="text-status-denied">*</span>}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground font-mono">{f.key} · {f.kind}</div>
                </div>
                <select
                  value={mapped ?? ''}
                  onChange={e => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                  className={`h-8 min-w-[160px] text-[12px] rounded-md border bg-card px-2 ${
                    isReq && !mapped ? 'border-status-denied' : 'border-input'
                  }`}
                >
                  {headerOpts.map(h => <option key={h} value={h}>{h || '— unmapped —'}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Preview (first 5 rows)">
        <div className="overflow-x-auto">
          <table className="text-[11.5px] w-full">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                {parsed.headers.map(h => <th key={h} className="px-2 py-1.5 font-mono whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-b">
                  {parsed.headers.map(h => <td key={h} className="px-2 py-1.5 font-mono whitespace-nowrap">{r[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted">← Restart</button>
        <div className="flex items-center gap-3">
          {missingReq.length > 0 && (
            <span className="text-[11.5px] text-status-denied">
              Missing required: {missingReq.join(', ')}
            </span>
          )}
          <button
            onClick={onNext}
            disabled={missingReq.length > 0}
            className="h-8 px-4 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Validate →
          </button>
        </div>
      </div>
    </div>
  );
}

function ValidateStep({ summary, rows, committing, onBack, onCommit, file, source }: {
  summary: ValidationSummary; rows: ParsedRow[]; committing: boolean;
  onBack: () => void; onCommit: () => void; file: File; source: ImportSourceType;
}) {
  const issues = useMemo(() => rows.filter(r => r.issues.length > 0).slice(0, 50), [rows]);
  const scoreTone = summary.import_score >= 85 ? 'text-status-paid' : summary.import_score >= 60 ? 'text-status-pending' : 'text-status-denied';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Stat label="File" value={file.name} mono />
        <Stat label="Total Rows" value={String(summary.total)} />
        <Stat label="OK" value={String(summary.ok)} tone="text-status-paid" />
        <Stat label="Warnings" value={String(summary.warning)} tone="text-status-pending" />
        <Stat label="Errors" value={String(summary.error)} tone="text-status-denied" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Duplicates" value={String(summary.duplicates)} />
        <Stat label="Import Score" value={`${summary.import_score}/100`} tone={scoreTone} />
        <Stat label="Source" value={SOURCE_LABEL[source]} />
      </div>

      <Panel title={`Issues (${issues.length} of ${rows.filter(r => r.issues.length > 0).length} rows shown)`}>
        {issues.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-status-paid flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> All rows clean — ready to commit.
          </div>
        ) : (
          <div className="divide-y -mx-4 -my-4 max-h-[420px] overflow-y-auto">
            {issues.map(r => (
              <div key={r.index} className="px-4 py-2 text-[12px]">
                <div className="font-mono text-[11px] text-muted-foreground mb-0.5">Row {r.index + 1}</div>
                {r.issues.map((i, k) => (
                  <div key={k} className="flex items-start gap-1.5">
                    {i.level === 'error' ? <X className="h-3 w-3 text-status-denied mt-0.5 shrink-0" />
                      : i.level === 'warning' ? <AlertTriangle className="h-3 w-3 text-status-pending mt-0.5 shrink-0" />
                      : <AlertCircle className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />}
                    <span className={i.level === 'error' ? 'text-status-denied' : 'text-foreground'}>{i.message}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted">← Back to mapping</button>
        <button
          onClick={onCommit}
          disabled={committing || summary.ok + summary.warning === 0}
          className="h-8 px-4 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
        >
          {committing ? 'Committing…' : `Commit ${summary.ok + summary.warning} rows →`}
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ summary, fileName, onAnother }: { summary: ValidationSummary; fileName: string; onAnother: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <Panel title="Import Complete">
        <div className="py-6 space-y-3">
          <div className="flex items-center gap-2 text-status-paid">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-[14px] font-semibold">{fileName} ingested.</span>
          </div>
          <ul className="text-[12.5px] space-y-1 text-muted-foreground">
            <li>· {summary.ok + summary.warning} claims pushed through Denial Intelligence + Recoverability + Next Best Action.</li>
            <li>· Routed into Recovery Operations queues based on severity and SLA windows.</li>
            <li>· {summary.error > 0 ? `${summary.error} error rows skipped (review in Import History).` : 'No error rows.'}</li>
          </ul>
          <div className="flex gap-2 pt-3">
            <button onClick={onAnother} className="h-8 px-3 text-[12px] rounded-md border bg-card hover:bg-muted">Import another file</button>
            <a href="/denials" className="h-8 px-3 inline-flex items-center text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90">View in Denial Command →</a>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone, mono }: { label: string; value: string; tone?: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2 rounded-md border bg-card">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[14px] font-semibold mt-0.5 ${tone ?? 'text-foreground'} ${mono ? 'font-mono text-[12px] truncate' : ''}`}>{value}</div>
    </div>
  );
}
