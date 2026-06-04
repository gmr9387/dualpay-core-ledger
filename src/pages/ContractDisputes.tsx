import { useDisputes } from '@/hooks/use-contracts';
import { updateDisputeStatus } from '@/lib/contracts';
import { formatCents } from '@/hooks/use-clarity-data';
import { useOrg } from '@/hooks/use-org';
import { can } from '@/lib/role-permissions';

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-status-denied/15 text-status-denied border-status-denied/30',
  high:     'bg-status-pending/20 text-status-pending border-status-pending/30',
  medium:   'bg-status-pending/10 text-status-pending border-status-pending/20',
  low:      'bg-muted text-muted-foreground border-border',
};

export default function ContractDisputes() {
  const { disputes, loading, reload } = useDisputes();
  const { currentOrg } = useOrg();
  const canApprove = can.escalate(currentOrg?.role);

  const setStatus = async (id: string, status: string) => {
    await updateDisputeStatus(id, status);
    reload();
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <header>
        <h1 className="text-xl font-bold">Underpayment Disputes</h1>
        <p className="text-[12.5px] text-muted-foreground">Contract-based variance disputes routed through Recovery Operations.</p>
      </header>

      <div className="rounded-lg border bg-card">
        {loading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> :
         disputes.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No disputes yet. Run contract matching against remittance imports to detect underpayments.</div> :
         <table className="w-full text-[12.5px]">
           <thead className="text-muted-foreground border-b">
             <tr>
               <th className="text-left p-2">Claim</th>
               <th className="text-left p-2">Payer</th>
               <th className="text-left p-2">CPT</th>
               <th className="text-right p-2">Expected</th>
               <th className="text-right p-2">Paid</th>
               <th className="text-right p-2">Variance</th>
               <th className="text-left p-2">Severity</th>
               <th className="text-left p-2">Status</th>
               <th className="text-left p-2">Action</th>
             </tr>
           </thead>
           <tbody>
             {disputes.map(d => (
               <tr key={d.dispute_id} className="border-b hover:bg-muted/30">
                 <td className="p-2 font-mono">{d.claim_id}</td>
                 <td className="p-2">{d.payer_name}</td>
                 <td className="p-2 font-mono">{d.procedure_code ?? '—'}</td>
                 <td className="p-2 text-right font-mono">{formatCents(d.expected_amount_cents)}</td>
                 <td className="p-2 text-right font-mono">{formatCents(d.paid_amount_cents)}</td>
                 <td className="p-2 text-right font-mono text-status-denied">{formatCents(d.variance_amount_cents)} ({d.variance_percent.toFixed(1)}%)</td>
                 <td className="p-2"><span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEVERITY_TONE[d.severity] ?? ''}`}>{d.severity}</span></td>
                 <td className="p-2">{d.status}</td>
                 <td className="p-2">
                   {canApprove && d.status !== 'closed' && (
                     <select defaultValue={d.status} onChange={e => setStatus(d.dispute_id, e.target.value)}
                       className="h-7 px-1 text-[11px] rounded border bg-background">
                       <option value="open">Open</option>
                       <option value="in_review">In Review</option>
                       <option value="submitted">Submitted</option>
                       <option value="recovered">Recovered</option>
                       <option value="closed">Closed</option>
                     </select>
                   )}
                 </td>
               </tr>
             ))}
           </tbody>
         </table>}
      </div>
    </div>
  );
}
