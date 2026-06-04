import { useMemo } from 'react';
import { useContracts, useDisputes } from '@/hooks/use-contracts';
import { formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';

export default function ContractAnalytics() {
  const { contracts } = useContracts();
  const { disputes } = useDisputes();

  const stats = useMemo(() => {
    const totalUnderpaid = disputes.reduce((s, d) => s + d.variance_amount_cents, 0);
    const recovered = disputes
      .filter(d => d.status === 'recovered')
      .reduce((s, d) => s + d.variance_amount_cents, 0);

    const byPayer = new Map<string, { variance: number; count: number }>();
    for (const d of disputes) {
      const e = byPayer.get(d.payer_name) ?? { variance: 0, count: 0 };
      e.variance += d.variance_amount_cents; e.count += 1;
      byPayer.set(d.payer_name, e);
    }
    const topPayers = [...byPayer.entries()]
      .sort((a, b) => b[1].variance - a[1].variance).slice(0, 10);

    const byContract = new Map<string, number>();
    for (const d of disputes) {
      if (!d.contract_id) continue;
      byContract.set(d.contract_id, (byContract.get(d.contract_id) ?? 0) + d.variance_amount_cents);
    }
    const topContracts = [...byContract.entries()]
      .map(([cid, variance]) => ({ contract: contracts.find(c => c.contract_id === cid), variance }))
      .filter(x => x.contract)
      .sort((a, b) => b.variance - a.variance).slice(0, 5);

    return {
      totalUnderpaid, recovered, topPayers, topContracts,
      complianceRate: disputes.length === 0 ? 100 :
        Math.max(0, 100 - (disputes.filter(d => d.severity === 'high' || d.severity === 'critical').length / Math.max(disputes.length, 1)) * 100),
    };
  }, [contracts, disputes]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <header>
        <h1 className="text-xl font-bold">Contract Analytics</h1>
        <p className="text-[12.5px] text-muted-foreground">Contract-based recovery performance.</p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Active Contracts" value={contracts.length.toString()} />
        <Kpi label="Disputes Generated" value={disputes.length.toString()} />
        <Kpi label="Dollars Underpaid" value={formatCentsCompact(stats.totalUnderpaid)} />
        <Kpi label="Dollars Recovered" value={formatCentsCompact(stats.recovered)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b text-[12.5px] font-semibold">Top Payers by Variance</div>
          {stats.topPayers.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No data.</div> :
            <table className="w-full text-[12.5px]">
              <tbody>
                {stats.topPayers.map(([payer, e]) => (
                  <tr key={payer} className="border-b last:border-b-0">
                    <td className="p-2">{payer}</td>
                    <td className="p-2 text-right font-mono">{formatCents(e.variance)}</td>
                    <td className="p-2 text-right text-muted-foreground">{e.count} disputes</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>

        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b text-[12.5px] font-semibold">Highest-Yield Contracts</div>
          {stats.topContracts.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No data.</div> :
            <table className="w-full text-[12.5px]">
              <tbody>
                {stats.topContracts.map(({ contract, variance }) => (
                  <tr key={contract!.contract_id} className="border-b last:border-b-0">
                    <td className="p-2">{contract!.payer_name} — {contract!.contract_name}</td>
                    <td className="p-2 text-right font-mono">{formatCents(variance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
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
