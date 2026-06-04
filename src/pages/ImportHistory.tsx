import { Link } from 'react-router-dom';
import { PageHeader, Panel, ScrollBody } from '@/components/clarity/primitives';
import { useImportBatches } from '@/hooks/use-import-batches';
import { SOURCE_LABEL } from '@/types/import';
import { formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { Upload } from 'lucide-react';

export default function ImportHistory() {
  const { batches, loading } = useImportBatches();
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Import History"
        subtitle="Complete audit log of every file ingested through the Recovery Factory."
        actions={
          <Link to="/factory/import" className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Upload className="h-3.5 w-3.5" /> New Import
          </Link>
        }
      />
      <ScrollBody>
        <div className="p-5">
          <Panel title={`${batches.length} import batches`}>
            {loading ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">Loading…</div>
            ) : batches.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">No imports yet.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="px-2 py-1.5">File</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Uploaded</th>
                    <th className="px-2 py-1.5 text-right">Rows</th>
                    <th className="px-2 py-1.5 text-right">OK</th>
                    <th className="px-2 py-1.5 text-right">Warn</th>
                    <th className="px-2 py-1.5 text-right">Err</th>
                    <th className="px-2 py-1.5 text-right">Score</th>
                    <th className="px-2 py-1.5 text-right">Expected Recovery</th>
                    <th className="px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.batch_id} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-1.5 font-mono text-[11px] max-w-[240px] truncate">{b.file_name}</td>
                      <td className="px-2 py-1.5">{SOURCE_LABEL[b.source_type]}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{relativeTime(b.uploaded_at)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{b.record_count}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-status-paid">{b.success_count}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-status-pending">{b.warning_count}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-status-denied">{b.error_count}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{b.import_score}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatCentsCompact(b.expected_recovery_cents)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`pill border text-[10px] ${
                          b.status === 'committed' ? 'bg-status-paid/15 text-status-paid border-status-paid/30'
                          : b.status === 'validated' ? 'bg-status-pending/15 text-status-pending border-status-pending/30'
                          : 'bg-muted text-muted-foreground border-border'
                        }`}>{b.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
