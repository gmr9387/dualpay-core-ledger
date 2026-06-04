import { useMemo } from 'react';
import { PageHeader, ScrollBody, Panel, KpiStrip } from '@/components/clarity/primitives';
import { useJobRuns } from '@/hooks/use-platform';
import { Cpu } from 'lucide-react';

export default function PlatformWorkers() {
  const { runs } = useJobRuns();
  const stats = useMemo(() => {
    const byWorker = new Map<string, { runs: number; ok: number; fail: number; totalMs: number; records: number }>();
    for (const r of runs) {
      const w = byWorker.get(r.worker_id) ?? { runs: 0, ok: 0, fail: 0, totalMs: 0, records: 0 };
      w.runs += 1;
      if (r.status === 'completed') w.ok += 1; else w.fail += 1;
      w.totalMs += r.duration_ms;
      w.records += r.records_processed;
      byWorker.set(r.worker_id, w);
    }
    return Array.from(byWorker.entries()).map(([worker, s]) => ({
      worker, ...s, avgMs: s.runs ? Math.round(s.totalMs / s.runs) : 0,
      successRate: s.runs ? Math.round((s.ok / s.runs) * 100) : 0,
    })).sort((a, b) => b.runs - a.runs);
  }, [runs]);

  const totalRuns = runs.length;
  const totalRecords = runs.reduce((s, r) => s + r.records_processed, 0);
  const avgDuration = totalRuns ? Math.round(runs.reduce((s, r) => s + r.duration_ms, 0) / totalRuns) : 0;
  const throughput = totalRecords; // records processed across all workers

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Workers" subtitle="Browser-resident worker pool · execution metrics from job_runs." />
      <KpiStrip tiles={[
        { label: 'Workers',       value: stats.length.toString() },
        { label: 'Total Runs',    value: totalRuns.toString() },
        { label: 'Avg Duration',  value: avgDuration ? `${avgDuration}ms` : '—' },
        { label: 'Records',       value: throughput.toString() },
      ]} />
      <ScrollBody>
        <div className="p-6">
          <Panel title="Workers">
            {stats.length === 0 ? (
              <div className="p-6 text-[12px] text-muted-foreground">No worker runs recorded yet.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Worker ID</th>
                    <th className="text-left px-3 py-2">Runs</th>
                    <th className="text-left px-3 py-2">Success</th>
                    <th className="text-left px-3 py-2">Failed</th>
                    <th className="text-left px-3 py-2">Avg Duration</th>
                    <th className="text-left px-3 py-2">Records</th>
                    <th className="text-left px-3 py-2">Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.worker} className="border-t">
                      <td className="px-3 py-2 font-mono">{s.worker}</td>
                      <td className="px-3 py-2">{s.runs}</td>
                      <td className="px-3 py-2 text-status-paid">{s.ok}</td>
                      <td className="px-3 py-2 text-status-denied">{s.fail}</td>
                      <td className="px-3 py-2">{s.avgMs}ms</td>
                      <td className="px-3 py-2">{s.records}</td>
                      <td className="px-3 py-2">{s.successRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
