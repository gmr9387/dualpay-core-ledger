import { Link } from 'react-router-dom';
import { PageHeader, KpiStrip, Panel, ScrollBody } from '@/components/clarity/primitives';
import { useImportBatches } from '@/hooks/use-import-batches';
import { useImportExceptions } from '@/hooks/use-import-exceptions';
import { formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { SOURCE_LABEL } from '@/types/import';
import { Upload, FileSpreadsheet, ListTodo, Download, AlertOctagon } from 'lucide-react';
import { downloadTemplate, listTemplates } from '@/lib/import-templates';

export default function RecoveryFactory() {
  const { batches, loading } = useImportBatches();

  const totalFiles = batches.length;
  const committed = batches.filter(b => b.status === 'committed');
  const claimsProcessed = committed.reduce((s, b) => s + b.success_count, 0);
  const denialsClassified = committed.reduce((s, b) => s + b.generated_claim_ids.length, 0);
  const expectedRecovery = committed.reduce((s, b) => s + b.expected_recovery_cents, 0);
  const totalRows = batches.reduce((s, b) => s + b.record_count, 0);
  const goodRows = batches.reduce((s, b) => s + b.success_count + b.warning_count, 0);
  const successRate = totalRows > 0 ? Math.round((goodRows / totalRows) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Recovery Factory"
        subtitle="Bulk-ingest denial, aging, underpayment, appeal, and payer follow-up data — automatically routed through the existing intelligence engines."
        actions={
          <Link to="/factory/import" className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
            <Upload className="h-3.5 w-3.5" /> New Import
          </Link>
        }
      />
      <KpiStrip tiles={[
        { label: 'Files Imported',         value: String(totalFiles) },
        { label: 'Claims Processed',       value: String(claimsProcessed) },
        { label: 'Denials Classified',     value: String(denialsClassified) },
        { label: 'Expected Recovery',      value: formatCentsCompact(expectedRecovery), tone: 'kpi-value-good' },
        { label: 'Import Success Rate',    value: `${successRate}%`, tone: successRate >= 85 ? 'kpi-value-good' : 'kpi-value-warn' },
      ]} />

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel
              title="Recent Imports"
              action={<Link to="/factory/history" className="text-[12px] text-primary hover:underline">View all →</Link>}
            >
              {loading ? (
                <div className="text-[12px] text-muted-foreground py-6 text-center">Loading…</div>
              ) : batches.length === 0 ? (
                <div className="text-[12.5px] text-muted-foreground py-8 text-center">
                  No imports yet. <Link to="/factory/import" className="text-primary hover:underline">Upload your first file</Link>.
                </div>
              ) : (
                <div className="divide-y -mx-4 -my-4">
                  {batches.slice(0, 8).map(b => (
                    <div key={b.batch_id} className="grid grid-cols-[1fr_120px_90px_90px_90px_80px] gap-3 items-center px-4 py-2.5 text-[12px]">
                      <span className="min-w-0">
                        <span className="font-mono text-[11.5px] truncate block">{b.file_name}</span>
                        <span className="text-[10.5px] text-muted-foreground">{SOURCE_LABEL[b.source_type]} · {relativeTime(b.uploaded_at)}</span>
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">{b.record_count} rows</span>
                      <span className="text-[11.5px] text-status-paid font-mono">{b.success_count} ok</span>
                      <span className={`text-[11.5px] font-mono ${b.error_count > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{b.error_count} err</span>
                      <span className="text-[11.5px] font-mono text-foreground">{formatCentsCompact(b.expected_recovery_cents)}</span>
                      <span className={`pill border text-[10px] ${
                        b.status === 'committed' ? 'bg-status-paid/15 text-status-paid border-status-paid/30'
                        : b.status === 'validated' ? 'bg-status-pending/15 text-status-pending border-status-pending/30'
                        : 'bg-muted text-muted-foreground border-border'
                      }`}>{b.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="How it works">
              <ol className="space-y-2 text-[12.5px] text-muted-foreground list-decimal pl-5">
                <li>Drop a CSV or XLSX export from your billing / clearinghouse system.</li>
                <li>Auto-detected column mapping — override any field as needed.</li>
                <li>Deterministic validation: required fields, amount sanity, CARC sanity, duplicates.</li>
                <li>Commit to push rows through Denial Intelligence, Recoverability, Next Best Action, and the Recovery Operations queues.</li>
              </ol>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Pilot Templates" action={<FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />}>
              <ul className="space-y-1.5 text-[12px]">
                {listTemplates().map(t => (
                  <li key={t.source} className="flex items-center justify-between">
                    <span className="text-foreground">{SOURCE_LABEL[t.source]}</span>
                    <button
                      onClick={() => downloadTemplate(t.source)}
                      className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download className="h-3 w-3" /> CSV
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Operational Links">
              <ul className="space-y-1.5 text-[12px]">
                <li><Link className="text-primary hover:underline inline-flex items-center gap-1.5" to="/factory/import"><Upload className="h-3 w-3" /> Import Center</Link></li>
                <li><Link className="text-primary hover:underline inline-flex items-center gap-1.5" to="/factory/history"><ListTodo className="h-3 w-3" /> Import History</Link></li>
                <li><Link className="text-primary hover:underline" to="/denials">→ Denial Command</Link></li>
                <li><Link className="text-primary hover:underline" to="/ops">→ Recovery Operations</Link></li>
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
