import { useMemo, useState } from 'react';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useAutomationJobs } from '@/hooks/use-automation';
import { formatCentsCompact } from '@/hooks/use-clarity-data';

export default function AutomationJobs() {
  const { jobs, loading } = useAutomationJobs(500);
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    return jobs.filter(j => j.status === filter);
  }, [jobs, filter]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Automation Jobs" subtitle="Every persisted automation execution, newest first." />
      <ScrollBody>
        <div className="p-5 space-y-4">
          <Panel title="Filters">
            <div className="flex gap-2 text-[12px]">
              {['all', 'pending', 'running', 'completed', 'failed'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`pill border ${filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30'}`}>
                  {s}
                </button>
              ))}
              <span className="ml-auto font-mono text-muted-foreground">{filtered.length} job(s)</span>
            </div>
          </Panel>

          <Panel title="Jobs">
            {loading ? <div className="text-[12px] text-muted-foreground">Loading…</div> :
             filtered.length === 0 ? <div className="text-[12px] text-muted-foreground">No jobs match.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-[10.5px] uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-1.5">Type</th>
                      <th className="text-left">Status</th>
                      <th className="text-right">Processed</th>
                      <th className="text-right">OK</th>
                      <th className="text-right">Failed</th>
                      <th className="text-right">Value</th>
                      <th className="text-left">Pipeline</th>
                      <th className="text-left">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(j => (
                      <tr key={j.job_id}>
                        <td className="py-1.5">{j.job_type}</td>
                        <td>{j.status}</td>
                        <td className="text-right font-mono">{j.records_processed}</td>
                        <td className="text-right font-mono text-status-paid">{j.records_succeeded}</td>
                        <td className="text-right font-mono text-status-denied">{j.records_failed}</td>
                        <td className="text-right font-mono">{formatCentsCompact(j.recovery_value_cents || 0)}</td>
                        <td className="font-mono text-[10.5px] text-muted-foreground">{j.pipeline_id?.slice(0, 8) ?? '—'}</td>
                        <td className="font-mono text-[10.5px] text-muted-foreground">{j.started_at ? new Date(j.started_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
