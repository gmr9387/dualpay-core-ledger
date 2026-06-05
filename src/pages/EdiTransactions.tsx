/**
 * Phase 21 — EDI Transactions list
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileSearch } from 'lucide-react';
import { listEdiTransactions } from '@/lib/edi-gateway';
import type { EdiTransactionRow } from '@/types/edi';

export default function EdiTransactions() {
  const [rows, setRows] = useState<EdiTransactionRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => { listEdiTransactions().then(setRows); }, []);

  const filtered = rows.filter((r) =>
    !q || r.file_name.toLowerCase().includes(q.toLowerCase()) ||
    (r.sender_id ?? '').toLowerCase().includes(q.toLowerCase()) ||
    (r.interchange_control_number ?? '').includes(q),
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FileSearch className="h-6 w-6" /> EDI Transactions</h1>
        <p className="text-sm text-muted-foreground">All parsed X12 transactions with envelope metadata and control numbers.</p>
      </div>
      <Input placeholder="Search by filename, sender, or control number…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      <Card>
        <CardHeader><CardTitle className="text-sm">{filtered.length} transactions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_80px_140px_140px_100px_100px] gap-3 text-xs font-medium text-muted-foreground border-b pb-2">
            <div>File</div><div>Type</div><div>Sender</div><div>ICN</div><div>Segments</div><div>Status</div>
          </div>
          {filtered.map((r) => (
            <div key={r.transaction_id} className="grid grid-cols-[1fr_80px_140px_140px_100px_100px] gap-3 items-center py-2 border-b border-border/40 text-xs">
              <div className="font-mono truncate">{r.file_name}</div>
              <div><Badge variant="outline">{r.transaction_type}</Badge></div>
              <div className="font-mono text-muted-foreground truncate">{r.sender_id ?? '—'}</div>
              <div className="font-mono text-muted-foreground">{r.interchange_control_number ?? '—'}</div>
              <div className="font-mono">{r.segment_count}</div>
              <div>
                <Badge variant={r.validation_status === 'valid' ? 'default' : 'destructive'}>
                  {r.status}
                </Badge>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground py-6">No transactions.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
