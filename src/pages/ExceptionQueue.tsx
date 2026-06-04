import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, KpiStrip, Panel, ScrollBody } from '@/components/clarity/primitives';
import { useImportExceptions } from '@/hooks/use-import-exceptions';
import { useImportBatches } from '@/hooks/use-import-batches';
import { retryExceptions } from '@/lib/import-exceptions';
import { STATUS_LABEL, type ExceptionSeverity, type ExceptionStatus } from '@/types/exceptions';
import { relativeTime } from '@/hooks/use-clarity-data';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const STATUSES: ExceptionStatus[] = ['open', 'corrected', 'ignored', 'imported'];
const SEVERITIES: ExceptionSeverity[] = ['error', 'warning'];

export default function ExceptionQueue() {
  const navigate = useNavigate();
  const [statusF, setStatusF] = useState<ExceptionStatus | 'all'>('open');
  const [sevF, setSevF] = useState<ExceptionSeverity | 'all'>('all');
  const [batchF, setBatchF] = useState<string | 'all'>('all');

  const { exceptions, loading, refresh } = useImportExceptions();
  const { batches } = useImportBatches();
  const batchMap = useMemo(() => new Map(batches.map(b => [b.batch_id, b])), [batches]);

  const filtered = exceptions.filter(e =>
    (statusF === 'all' || e.status === statusF) &&
    (sevF === 'all' || e.severity === sevF) &&
    (batchF === 'all' || e.batch_id === batchF));

  const open = exceptions.filter(e => e.status === 'open').length;
  const corrected = exceptions.filter(e => e.status === 'corrected').length;
  const imported = exceptions.filter(e => e.status === 'imported').length;
  const ignored = exceptions.filter(e => e.status === 'ignored').length;

  async function retrySelected() {
    const target = filtered.filter(e => e.status === 'corrected');
    if (target.length === 0) { toast.info('No corrected exceptions to retry.'); return; }
    const sourceByBatch = new Map(batches.map(b => [b.batch_id, b.source_type]));
    let imp = 0, skp = 0;
    for (const b of new Set(target.map(t => t.batch_id))) {
      const src = sourceByBatch.get(b);
      if (!src) continue;
      const r = await retryExceptions(target.filter(t => t.batch_id === b), src);
      imp += r.imported; skp += r.skipped;
    }
    toast.success(`Retry complete · ${imp} imported, ${skp} skipped`);
    refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Exception Queue"
        subtitle="Every failed or warning row is preserved here — review, correct, retry, or ignore."
        actions={
          <button onClick={retrySelected}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <RefreshCw className="h-3.5 w-3.5" /> Retry corrected ({filtered.filter(e => e.status === 'corrected').length})
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Open',      value: String(open),      tone: open > 0 ? 'kpi-value-warn' : undefined },
        { label: 'Corrected', value: String(corrected) },
        { label: 'Imported',  value: String(imported),  tone: 'kpi-value-good' },
        { label: 'Ignored',   value: String(ignored) },
        { label: 'Total',     value: String(exceptions.length) },
      ]} />

      <div className="flex items-center gap-3 px-5 py-2 border-b bg-card text-[12px]">
        <Filter label="Status" value={statusF} onChange={(v) => setStatusF(v as ExceptionStatus | 'all')}
          options={[['all','All'] as [string,string]].concat(STATUSES.map(s => [s, STATUS_LABEL[s]] as [string,string]))} />
        <Filter label="Severity" value={sevF} onChange={(v) => setSevF(v as ExceptionSeverity | 'all')}
          options={[['all','All'], ...SEVERITIES.map(s => [s, s] as [string,string])]} />
        <Filter label="Batch" value={batchF} onChange={setBatchF}
          options={[['all','All batches'], ...batches.slice(0, 50).map(b => [b.batch_id, b.file_name] as [string,string])]} />
      </div>

      <ScrollBody>
        <div className="p-5">
          <Panel title={`${filtered.length} exception${filtered.length === 1 ? '' : 's'}`}>
            {loading ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">No exceptions match the current filters.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="px-2 py-1.5">Exception</th>
                    <th className="px-2 py-1.5">Batch</th>
                    <th className="px-2 py-1.5 text-right">Row</th>
                    <th className="px-2 py-1.5">Severity</th>
                    <th className="px-2 py-1.5 text-right">Errors</th>
                    <th className="px-2 py-1.5 text-right">Warnings</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const b = batchMap.get(e.batch_id);
                    return (
                      <tr key={e.exception_id} className="border-b hover:bg-muted/40 cursor-pointer"
                          onClick={() => navigate(`/factory/exceptions/${e.exception_id}`)}>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{e.exception_id}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px] max-w-[180px] truncate">
                          {b?.file_name ?? e.batch_id.slice(0, 8)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{e.row_number}</td>
                        <td className="px-2 py-1.5">
                          {e.severity === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-status-denied">
                              <X className="h-3 w-3" /> error
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-status-pending">
                              <AlertTriangle className="h-3 w-3" /> warning
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-status-denied">{e.error_count}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-status-pending">{e.warning_count}</td>
                        <td className="px-2 py-1.5">
                          <span className={statusPill(e.status)}>{STATUS_LABEL[e.status]}</span>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{relativeTime(e.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
          <div className="mt-3 text-[11.5px] text-muted-foreground">
            <Link to="/factory" className="text-primary hover:underline">← Back to Recovery Factory</Link>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Filter({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string,string][];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-7 text-[12px] rounded-md border border-input bg-card px-2">
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function statusPill(s: ExceptionStatus): string {
  const base = 'pill border text-[10px] ';
  switch (s) {
    case 'open':      return base + 'bg-status-pending/15 text-status-pending border-status-pending/30';
    case 'corrected': return base + 'bg-status-adjusted/15 text-status-adjusted border-status-adjusted/30';
    case 'imported':  return base + 'bg-status-paid/15 text-status-paid border-status-paid/30';
    case 'ignored':   return base + 'bg-muted text-muted-foreground border-border';
  }
}
