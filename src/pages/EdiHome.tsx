/**
 * Phase 21 — EDI Overview
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Upload, FileSearch, AlertTriangle } from 'lucide-react';
import { listEdiTransactions, listEdiErrors } from '@/lib/edi-gateway';
import type { EdiTransactionRow, EdiErrorRow } from '@/types/edi';

export default function EdiHome() {
  const [txns, setTxns] = useState<EdiTransactionRow[]>([]);
  const [errs, setErrs] = useState<EdiErrorRow[]>([]);

  useEffect(() => {
    listEdiTransactions().then(setTxns);
    listEdiErrors().then(setErrs);
  }, []);

  const filesImported = txns.length;
  const txProcessed = txns.filter((t) => t.status === 'normalized' || t.status === 'imported').length;
  const validationErrors = errs.length;
  const claimsGen = txns.filter((t) => t.transaction_type.startsWith('837')).length;
  const remitGen = txns.filter((t) => t.transaction_type === '835').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6" /> EDI Gateway
          </h1>
          <p className="text-sm text-muted-foreground">
            Native X12 ingestion for 835 remittances and 837P/I claims.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/edi/import" className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            <Upload className="h-4 w-4" /> Import EDI
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Kpi label="Files Imported" value={filesImported} />
        <Kpi label="Transactions Processed" value={txProcessed} />
        <Kpi label="Validation Errors" value={validationErrors} accent="amber" />
        <Kpi label="Claims (837)" value={claimsGen} />
        <Kpi label="Remittances (835)" value={remitGen} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSearch className="h-4 w-4" /> Recent Transactions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {txns.slice(0, 8).map((t) => (
              <Link key={t.transaction_id} to="/edi/transactions" className="flex items-center justify-between border-b border-border/40 py-1.5 hover:bg-muted/30">
                <span className="font-mono text-xs">{t.file_name}</span>
                <span className="text-xs text-muted-foreground">{t.transaction_type} · {t.status}</span>
              </Link>
            ))}
            {txns.length === 0 && <p className="text-xs text-muted-foreground">No EDI files imported yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Recent Errors</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {errs.slice(0, 8).map((e) => (
              <div key={e.error_id} className="border-b border-border/40 py-1.5">
                <div className="text-xs font-mono">{e.error_code ?? 'ERROR'} <span className="text-muted-foreground">· {e.severity}</span></div>
                <div className="text-xs text-muted-foreground">{e.message}</div>
              </div>
            ))}
            {errs.length === 0 && <p className="text-xs text-muted-foreground">No validation errors.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: 'amber' }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className={`text-2xl font-semibold ${accent === 'amber' ? 'text-amber-600' : ''}`}>{value.toLocaleString()}</CardContent>
    </Card>
  );
}
