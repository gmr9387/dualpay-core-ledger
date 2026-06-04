/**
 * Phase 17 — Platform Operations home.
 * Worker dashboard with KPIs, queue snapshot, and pipeline enqueue/drain.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Cpu, AlertTriangle, Loader2, Play, Zap } from 'lucide-react';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useQueueJobs, useJobRuns, platformKpis } from '@/hooks/use-platform';
import { useWorkers } from '@/hooks/use-workers';
import { isHealthy } from '@/lib/worker-heartbeat';
import { useOrg } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';
import { enqueueRecoveryPipeline } from '@/engine/pipeline-orchestrator';
import { drainQueue, getWorkerId } from '@/engine/worker-executor';

export default function PlatformHome() {
  const { jobs, loading, reload } = useQueueJobs();
  const { runs } = useJobRuns();
  const { currentOrg } = useOrg();
  const [busy, setBusy] = useState<string | null>(null);
  const canRun = roleAtLeast(currentOrg?.role, 'analyst');
  const kpis = useMemo(() => platformKpis(jobs, runs), [jobs, runs]);

  const recent = jobs.slice(0, 12);

  const enqueue = async () => {
    setBusy('enqueue');
    try { await enqueueRecoveryPipeline(); reload(); } finally { setBusy(null); }
  };
  const drain = async () => {
    setBusy('drain');
    try { await drainQueue(50); reload(); } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Platform Operations"
        subtitle="Durable job queue · workers, retries, and dead-letter recovery."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={enqueue} disabled={!canRun || !!busy}
              className="inline-flex items-center gap-1.5 rounded border bg-card text-[12px] px-3 py-1.5 hover:bg-muted disabled:opacity-40">
              {busy === 'enqueue' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Enqueue Pipeline
            </button>
            <button onClick={drain} disabled={!canRun || !!busy}
              className="inline-flex items-center gap-1.5 rounded bg-primary text-primary-foreground text-[12px] px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-40">
              {busy === 'drain' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Drain Queue
            </button>
          </div>
        }
      />

      <KpiStrip tiles={[
        { label: 'Queued',        value: kpis.queued.toString() },
        { label: 'Running',       value: kpis.running.toString(), tone: kpis.running ? 'status-pending' : '' },
        { label: 'Completed',     value: kpis.completed.toString(), tone: 'status-paid' },
        { label: 'Failed',        value: kpis.failed.toString(),    tone: kpis.failed ? 'status-denied' : '' },
        { label: 'Dead Letter',   value: kpis.dead.toString(),      tone: kpis.dead ? 'status-denied' : '' },
        { label: 'Avg Duration',  value: kpis.avgDuration ? `${kpis.avgDuration}ms` : '—' },
        { label: 'Throughput',    value: runs.length ? `${runs.length} runs` : '—' },
        { label: 'Success Rate',  value: (kpis.completed + kpis.dead) ? `${Math.round(kpis.successRate*100)}%` : 'Insufficient Processing History' },
      ]} />

      <ScrollBody>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            Worker ID: <span className="font-mono">{getWorkerId()}</span>
          </div>

          <Panel title="Recent Queue Activity">
            {loading ? (
              <div className="p-6 text-[12px] text-muted-foreground">Loading…</div>
            ) : recent.length === 0 ? (
              <div className="p-6 text-[12px] text-muted-foreground">
                No queue activity yet. Click <strong>Enqueue Pipeline</strong> to start.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Job</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Attempts</th>
                    <th className="text-left px-3 py-2">Pipeline</th>
                    <th className="text-left px-3 py-2">Queued</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(j => (
                    <tr key={j.queue_job_id} className="border-t">
                      <td className="px-3 py-2 font-mono">{j.job_type}</td>
                      <td className="px-3 py-2"><StatusPill status={j.status} /></td>
                      <td className="px-3 py-2">{j.attempts}/{j.max_attempts}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground">{j.pipeline_id?.slice(0,8) ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(j.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Link to="/platform/jobs" className="p-4 rounded border bg-card hover:bg-muted">
              <ListChecks className="h-4 w-4 text-primary mb-2" />
              <div className="text-[13px] font-semibold">All Jobs</div>
              <div className="text-[11.5px] text-muted-foreground">Queue, runtime, retries.</div>
            </Link>
            <Link to="/platform/workers" className="p-4 rounded border bg-card hover:bg-muted">
              <Cpu className="h-4 w-4 text-primary mb-2" />
              <div className="text-[13px] font-semibold">Workers</div>
              <div className="text-[11.5px] text-muted-foreground">Throughput &amp; runs.</div>
            </Link>
            <Link to="/platform/failures" className="p-4 rounded border bg-card hover:bg-muted">
              <AlertTriangle className="h-4 w-4 text-status-denied mb-2" />
              <div className="text-[13px] font-semibold">Failure Center</div>
              <div className="text-[11.5px] text-muted-foreground">Inspect / retry / archive.</div>
            </Link>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === 'completed' ? 'status-paid'
    : status === 'running' ? 'status-pending'
    : status === 'failed' ? 'status-denied'
    : status === 'dead_letter' ? 'status-denied'
    : 'status-cob';
  return <span className={cls}>{status}</span>;
}
