/**
 * Phase 21 — EDI Errors viewer
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { listEdiErrors } from '@/lib/edi-gateway';
import type { EdiErrorRow } from '@/types/edi';

export default function EdiErrors() {
  const [rows, setRows] = useState<EdiErrorRow[]>([]);
  useEffect(() => { listEdiErrors().then(setRows); }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><AlertTriangle className="h-6 w-6" /> EDI Errors</h1>
        <p className="text-sm text-muted-foreground">Validation issues surfaced by the X12 validator.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">{rows.length} issues</CardTitle></CardHeader>
        <CardContent>
          {rows.map((e) => (
            <div key={e.error_id} className="border-b border-border/40 py-2 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={e.severity === 'error' ? 'destructive' : 'secondary'}>{e.severity}</Badge>
                <span className="font-mono">{e.error_code ?? 'UNCODED'}</span>
                <span className="text-muted-foreground">· {new Date(e.created_at).toLocaleString()}</span>
              </div>
              <div className="text-foreground">{e.message}</div>
              <div className="text-muted-foreground font-mono">txn {e.transaction_id.slice(0, 8)}…</div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-xs text-muted-foreground py-6">No errors recorded.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
