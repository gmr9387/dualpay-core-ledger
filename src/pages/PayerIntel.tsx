import { useMemo } from 'react';
import { useClarityData, formatCents, formatCentsCompact } from '@/hooks/use-clarity-data';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { Loader2 } from 'lucide-react';

export default function PayerIntel() {
  const { data: claims, isLoading } = useClarityData();
  const payers = useMemo(() => {
    if (!claims) return [];
    const m = new Map<string, { name: string; cls: string; claims: number; billed: number; paid: number; atRisk: number; denials: number; avgRec: number }>();
    for (const c of claims) {
      const cur = m.get(c.intel.payer_id) ?? { name: c.intel.payer_name, cls: c.intel.payer_class, claims: 0, billed: 0, paid: 0, atRisk: 0, denials: 0, avgRec: 0 };
      cur.claims += 1;
      cur.billed += c.total_billed;
      cur.paid += c.intel.actual_reimbursement_cents;
      cur.atRisk += c.intel.amount_at_risk_cents;
      cur.denials += c.intel.denial_events.length;
      cur.avgRec += c.intel.recoverability_score;
      m.set(c.intel.payer_id, cur);
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v, avgRec: Math.round(v.avgRec / v.claims), denialRate: v.denials / v.claims })).sort((a, b) => b.atRisk - a.atRisk);
  }, [claims]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Payer Intelligence" subtitle="Payer performance: collection rates, denial patterns, and operational friction." />
      <ScrollBody>
        <div className="p-5">
          <Panel title={`Payers (${payers.length})`}>
            <div className="divide-y -mx-4 -my-4">
              <div className="grid grid-cols-[200px_90px_90px_110px_130px_130px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                <span>Payer</span><span>Class</span><span>Claims</span><span>Denial Rate</span>
                <span className="text-right">Billed</span><span className="text-right">Paid</span><span className="text-right">At Risk</span>
              </div>
              {payers.map(p => (
                <div key={p.id} className="grid grid-cols-[200px_90px_90px_110px_130px_130px_120px] gap-3 items-center px-4 py-2.5">
                  <div>
                    <div className="text-[12.5px] font-medium text-foreground truncate">{p.name}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">{p.id}</div>
                  </div>
                  <span className="text-[11.5px] text-muted-foreground capitalize">{p.cls}</span>
                  <span className="font-mono text-[12px] text-foreground">{p.claims}</span>
                  <span className="font-mono text-[12px] text-foreground">{(p.denialRate * 100).toFixed(0)}%</span>
                  <span className="font-mono text-[12px] text-right tabular-nums text-foreground">{formatCentsCompact(p.billed)}</span>
                  <span className="font-mono text-[12px] text-right tabular-nums amount-positive">{formatCentsCompact(p.paid)}</span>
                  <span className="font-mono text-[12px] text-right tabular-nums amount-negative">{formatCents(p.atRisk)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
