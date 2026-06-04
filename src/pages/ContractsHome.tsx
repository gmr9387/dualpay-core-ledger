import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContracts, useDisputes } from '@/hooks/use-contracts';
import { FileText, Upload, AlertTriangle, BarChart3, Plus } from 'lucide-react';
import { formatCents } from '@/hooks/use-clarity-data';

export default function ContractsHome() {
  const { contracts, loading } = useContracts();
  const { disputes } = useDisputes();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contracts.filter(c =>
      !q || c.payer_name.toLowerCase().includes(q) || c.contract_name.toLowerCase().includes(q));
  }, [contracts, search]);

  const totalUnderpaidCents = disputes.reduce((s, d) => s + d.variance_amount_cents, 0);
  const openDisputes = disputes.filter(d => d.status === 'open').length;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Contract Intelligence</h1>
          <p className="text-[12.5px] text-muted-foreground">Payer contracts, fee schedules, and true underpayment detection.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/contracts/analytics" className="px-3 py-1.5 text-[12.5px] rounded-md border hover:bg-muted inline-flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5"/>Analytics</Link>
          <Link to="/contracts/disputes" className="px-3 py-1.5 text-[12.5px] rounded-md border hover:bg-muted inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5"/>Disputes</Link>
          <Link to="/contracts/upload" className="px-3 py-1.5 text-[12.5px] rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1.5"><Upload className="h-3.5 w-3.5"/>Upload Contract</Link>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Active Contracts" value={contracts.length.toString()} />
        <Kpi label="Open Disputes"    value={openDisputes.toString()} />
        <Kpi label="Total Underpaid"  value={formatCents(totalUnderpaidCents)} />
        <Kpi label="Disputes (All)"   value={disputes.length.toString()} />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-3 border-b flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search payer or contract…"
            className="flex-1 h-8 px-2 text-[12.5px] rounded border bg-background" />
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading contracts…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No contracts yet. <Link to="/contracts/upload" className="text-primary underline">Upload your first contract</Link>.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="text-muted-foreground border-b">
              <tr><th className="text-left p-2">Payer</th><th className="text-left p-2">Contract</th><th className="text-left p-2">Version</th><th className="text-left p-2">Effective</th><th className="text-left p-2">Termination</th><th className="text-left p-2">Type</th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.contract_id} className="border-b hover:bg-muted/40">
                  <td className="p-2 font-medium">{c.payer_name}</td>
                  <td className="p-2"><Link to={`/contracts/${c.contract_id}`} className="text-primary hover:underline inline-flex items-center gap-1"><FileText className="h-3 w-3"/>{c.contract_name}</Link></td>
                  <td className="p-2 font-mono">v{c.version}</td>
                  <td className="p-2 font-mono">{c.effective_date}</td>
                  <td className="p-2 font-mono">{c.termination_date ?? '—'}</td>
                  <td className="p-2">{c.contract_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
