/**
 * Phase 10 — Remittance Intake Dashboard
 *
 * Surfaces 835 / EOB / remittance ingestion metrics: total remittances,
 * denials, underpayments, COB lines, and expected recoverable dollars.
 * Imports are performed through the existing Import Center wizard with
 * source type "835 Remittance" — no separate ingestion flow.
 */
import { Link } from 'react-router-dom';
import { PageHeader, KpiStrip, Panel, ScrollBody } from '@/components/clarity/primitives';
import { useRemittanceBatches } from '@/hooks/use-remittance-batches';
import { formatCentsCompact, relativeTime } from '@/hooks/use-clarity-data';
import { Upload, Download, FileSpreadsheet, AlertOctagon, TrendingDown, Layers } from 'lucide-react';
import { downloadTemplate } from '@/lib/import-templates';

export default function RemittanceIntake() {
  const { batches, loading } = useRemittanceBatches();

  const remittances = batches.length;
  const totalLines = batches.reduce((s, b) => s + b.record_count, 0);
  const denials = batches.reduce((s, b) => s + b.denial_count, 0);
  const underpayments = batches.reduce((s, b) => s + b.underpayment_count, 0);
  const cob = batches.reduce((s, b) => s + b.cob_count, 0);
  const opportunities = denials + underpayments + cob;
  const expectedRecovery = batches.reduce((s, b) => s + b.expected_recovery_cents, 0);
  const totalPaid = batches.reduce((s, b) => s + b.total_paid_cents, 0);
  const totalAdj = batches.reduce((s, b) => s + b.total_adjustment_cents, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Remittance Intake"
        subtitle="Ingest 835-derived CSVs, EOB exports, and payer remittance reports — auto-detects denials, underpayments, and COB opportunities through the existing intelligence engines."
        actions={
          <Link
            to="/factory/import?source=remittance_835"
            className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <Upload className="h-3.5 w-3.5" /> Upload Remittance
          </Link>
        }
      />
      <KpiStrip tiles={[
        { label: 'Remittances Imported',  value: String(remittances) },
        { label: 'Lines Processed',       value: String(totalLines) },
        { label: 'Denials Detected',      value: String(denials), tone: denials > 0 ? 'kpi-value-warn' : undefined },
        { label: 'Underpayments',         value: String(underpayments), tone: underpayments > 0 ? 'kpi-value-warn' : undefined },
        { label: 'COB Lines',             value: String(cob) },
        { label: 'Recovery Opportunities',value: String(opportunities), tone: 'kpi-value-good' },
        { label: 'Expected Recovery',     value: formatCentsCompact(expectedRecovery), tone: 'kpi-value-good' },
        { label: 'Total Paid',            value: formatCentsCompact(totalPaid) },
      ]} />

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Recent Remittance Batches">
              {loading ? (
                <div className="text-[12px] text-muted-foreground py-6 text-center">Loading…</div>
              ) : batches.length === 0 ? (
                <div className="text-[12.5px] text-muted-foreground py-8 text-center">
                  No remittances ingested yet.{' '}
                  <Link to="/factory/import?source=remittance_835" className="text-primary hover:underline">
                    Upload an 835 / EOB export
                  </Link>.
                </div>
              ) : (
                <div className="divide-y -mx-4 -my-4">
                  <div className="grid grid-cols-[1fr_110px_80px_80px_70px_110px] gap-3 px-4 py-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground border-b">
                    <span>File / Payer</span>
                    <span>Lines</span>
                    <span>Denials</span>
                    <span>Underpay</span>
                    <span>COB</span>
                    <span className="text-right">Expected</span>
                  </div>
                  {batches.slice(0, 12).map(b => (
                    <div key={b.batch_id} className="grid grid-cols-[1fr_110px_80px_80px_70px_110px] gap-3 items-center px-4 py-2.5 text-[12px]">
                      <span className="min-w-0">
                        <span className="font-mono text-[11.5px] truncate block">{b.file_name}</span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {b.payer_name ?? 'Mixed payers'} · {relativeTime(b.uploaded_at)}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-muted-foreground font-mono">{b.record_count}</span>
                      <span className={`text-[11.5px] font-mono ${b.denial_count > 0 ? 'text-status-denied' : 'text-muted-foreground'}`}>{b.denial_count}</span>
                      <span className={`text-[11.5px] font-mono ${b.underpayment_count > 0 ? 'text-status-pending' : 'text-muted-foreground'}`}>{b.underpayment_count}</span>
                      <span className={`text-[11.5px] font-mono ${b.cob_count > 0 ? 'text-status-adjusted' : 'text-muted-foreground'}`}>{b.cob_count}</span>
                      <span className="text-[11.5px] font-mono text-status-paid text-right">{formatCentsCompact(b.expected_recovery_cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="How remittance ingestion works">
              <ol className="space-y-2 text-[12.5px] text-muted-foreground list-decimal pl-5">
                <li>Upload a structured 835-derived CSV, EOB export, or payer remittance spreadsheet (raw EDI not yet supported).</li>
                <li>The <b>Remittance Normalizer</b> converts each row into a canonical remittance shape (billed / allowed / paid / patient_resp / adjustment + CARC/RARC).</li>
                <li>The <b>Denial Extractor</b> classifies each line deterministically as denial, underpayment, COB, contractual, or paid-in-full.</li>
                <li>Recoverable lines are pushed through the existing Denial Intelligence taxonomy (<code>scoreDenial</code>) and routed into Recovery Operations queues, Playbooks, and the Escalation Engine.</li>
                <li>Adjustment totals (billed − paid − patient resp) are recorded for variance reporting.</li>
              </ol>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Adjustment Summary">
              <ul className="space-y-2 text-[12px]">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5"><Layers className="h-3 w-3" /> Total Adjustments</span>
                  <span className="font-mono text-foreground">{formatCentsCompact(totalAdj)}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5"><TrendingDown className="h-3 w-3" /> Contractual vs Variance</span>
                  <span className="font-mono text-muted-foreground">
                    {totalAdj > 0 ? `${Math.round((expectedRecovery / totalAdj) * 100)}% recoverable` : '—'}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5"><AlertOctagon className="h-3 w-3" /> Open Opportunities</span>
                  <span className="font-mono text-foreground">{opportunities}</span>
                </li>
              </ul>
            </Panel>

            <Panel title="Templates" action={<FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />}>
              <ul className="space-y-1.5 text-[12px]">
                <li className="flex items-center justify-between">
                  <span className="text-foreground">835 Remittance</span>
                  <button
                    onClick={() => downloadTemplate('remittance_835')}
                    className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Download className="h-3 w-3" /> CSV
                  </button>
                </li>
              </ul>
            </Panel>

            <Panel title="Where the data flows">
              <ul className="space-y-1.5 text-[12px]">
                <li><Link className="text-primary hover:underline" to="/denials">→ Denial Command</Link></li>
                <li><Link className="text-primary hover:underline" to="/recovery-intel">→ Recovery Intelligence</Link></li>
                <li><Link className="text-primary hover:underline" to="/ops">→ Recovery Operations</Link></li>
                <li><Link className="text-primary hover:underline" to="/playbooks">→ Recovery Playbooks</Link></li>
                <li><Link className="text-primary hover:underline" to="/escalations">→ Escalations</Link></li>
              </ul>
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}
