import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getContract } from '@/lib/contracts';
import { useFeeSchedules } from '@/hooks/use-contracts';
import type { PayerContract } from '@/types/contracts';
import { formatCents } from '@/hooks/use-clarity-data';
import { ArrowLeft } from 'lucide-react';

export default function ContractDetail() {
  const { contractId } = useParams();
  const [contract, setContract] = useState<PayerContract | null>(null);
  const fees = useFeeSchedules(contractId);

  useEffect(() => { if (contractId) getContract(contractId).then(setContract); }, [contractId]);

  if (!contract) return <div className="p-6 text-sm text-muted-foreground">Loading contract…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <Link to="/contracts" className="text-[12.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5"/>All Contracts</Link>
      <header>
        <h1 className="text-xl font-bold">{contract.payer_name} · {contract.contract_name}</h1>
        <p className="text-[12.5px] text-muted-foreground font-mono">v{contract.version} · {contract.contract_type} · effective {contract.effective_date}{contract.termination_date ? ` → ${contract.termination_date}` : ''}</p>
      </header>

      <div className="rounded-lg border bg-card">
        <div className="p-3 border-b text-[12.5px] font-semibold">Fee Schedule ({fees.length} lines)</div>
        {fees.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No fee schedule rows for this contract.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="text-muted-foreground border-b">
              <tr><th className="text-left p-2">Code</th><th className="text-left p-2">Modifier</th><th className="text-right p-2">Amount</th><th className="text-left p-2">Method</th></tr>
            </thead>
            <tbody>
              {fees.map(f => (
                <tr key={f.fee_schedule_id} className="border-b">
                  <td className="p-2 font-mono">{f.procedure_code}</td>
                  <td className="p-2 font-mono">{f.modifier ?? '—'}</td>
                  <td className="p-2 text-right font-mono">{formatCents(f.contracted_amount_cents)}</td>
                  <td className="p-2">{f.reimbursement_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
