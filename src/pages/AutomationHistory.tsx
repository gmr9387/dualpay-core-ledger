import { useMemo } from 'react';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useAutomationJobs } from '@/hooks/use-automation';
import { formatCentsCompact } from '@/hooks/use-clarity-data';

export default function AutomationHistory() {
  const { jobs, loading } = useAutomationJobs(500);

  const view = useMemo(() => {
    const completed = jobs.filter(j => j.status === 'completed');
    const totalDurationMs = completed.reduce((s, j) => {
      if (!j.started_at || !j.completed_at) return s;
      return s + (new Date(j.completed_at).getTime() - new Date(j.started_at).getTime());
    }, 0);
    const avgSec = completed.length ? Math.round(totalDurationMs / completed.length / 1000) : 0;
    const totalProcessed = jobs.reduce((s, j) => s + j.records_processed, 0);
    const totalFailed = jobs.reduce((s, j) => s + j.records_failed, 0);
    const totalValue = jobs.reduce((s, j) => s + j.recovery_value_cents, 0);
    return { completed: completed.length, avgSec, totalProcessed, totalFailed, totalValue };
  }, [jobs]);

  const pipelines = jobs.filter(j => j.job_type === 'pipeline');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Automation History" subtitle="Lifetime job log, durations, and recovery value generated." />
      <KpiStrip tiles={[
        { label: 'Completed Jobs',  value: String(view.completed) },
        { label: 'Avg Duration',    value: `${view.avgSec}s` },
        { label: 'Records Touched', value: String(view.totalProcessed) },
        { label: 'Failures',        value: String(view.totalFailed), tone: 'amount-negative' },
        { label: 'Value Generated', value: formatCentsCompact(view.totalValue), tone: 'amount-positive' },
      ]} />
      <ScrollBody>
        <div className="p-5 space-y-4">
          <Panel title="Pipeline Runs">
            {loading ? <div className="text-[12px] text-muted-foreground">Loading…</div> :
             pipelines.length === 0 ? <div className="text-[12px] text-muted-foreground">No pipeline runs yet.</div> : (
              <div className="divide-y -my-2">
                {pipelines.map(p => {
                  const dur = p.started_at && p.completed_at
                    ? Math.round((new Date(p.completed_at).getTime() - new Date(p.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <div key={p.job_id} className="py-2 text-[12px] grid grid-cols-[1fr_100px_100px_120px_120px] gap-2 items-center">
                      <div>
                        <div className="font-mono text-[10.5px] text-muted-foreground">{p.pipeline_id?.slice(0, 8)}</div>
                        <div className="text-[10.5px] text-muted-foreground">{p.started_at ? new Date(p.started_at).toLocaleString() : '—'}</div>
                      </div>
                      <span className={`pill border ${p.status === 'completed' ? 'bg-status-paid/15 text-status-paid border-status-paid/30' : p.status === 'failed' ? 'bg-status-denied/15 text-status-denied border-status-denied/30' : 'bg-muted'}`}>{p.status}</span>
                      <span className="font-mono">{dur !== null ? `${dur}s` : '—'}</span>
                      <span className="font-mono text-right">{p.records_processed} recs</span>
                      <span className="font-mono text-right amount-positive">{formatCentsCompact(p.recovery_value_cents || 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
