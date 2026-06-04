import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useQueueJobs } from '@/hooks/use-platform';
import { StatusPill } from './PlatformHome';
import { ListChecks } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';
import { retryJob } from '@/engine/retry-engine';

export default function PlatformJobs() {
  const { jobs, loading, reload } = useQueueJobs();
  const { currentOrg } = useOrg();
  const canRetry = roleAtLeast(currentOrg?.role, 'manager');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Job Queue" subtitle="All queued, running, and historical jobs." />
      <ScrollBody>
        <div className="p-6">
          <Panel title="Jobs">
            {loading ? <div className="p-6 text-[12px] text-muted-foreground">Loading…</div> : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Job</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Priority</th>
                    <th className="text-left px-3 py-2">Attempts</th>
                    <th className="text-left px-3 py-2">Worker</th>
                    <th className="text-left px-3 py-2">Pipeline</th>
                    <th className="text-left px-3 py-2">Created</th>
                    <th className="text-left px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.queue_job_id} className="border-t">
                      <td className="px-3 py-2 font-mono">{j.job_type}</td>
                      <td className="px-3 py-2"><StatusPill status={j.status} /></td>
                      <td className="px-3 py-2">{j.priority}</td>
                      <td className="px-3 py-2">{j.attempts}/{j.max_attempts}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground">{j.worker_id?.slice(0,12) ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground">{j.pipeline_id?.slice(0,8) ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {(j.status === 'failed' || j.status === 'dead_letter') && canRetry ? (
                          <button onClick={async () => { await retryJob(j.queue_job_id); reload(); }}
                            className="text-[11px] underline text-primary">Retry</button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground text-[12px]">No jobs yet.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
