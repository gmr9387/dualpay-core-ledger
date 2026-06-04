import { useMemo, useState } from 'react';
import { PageHeader, ScrollBody, Panel, KpiStrip } from '@/components/clarity/primitives';
import { useJobRuns } from '@/hooks/use-platform';
import { useWorkers, useSchedulerRuns } from '@/hooks/use-workers';
import { heartbeatAgeMs, isHealthy } from '@/lib/worker-heartbeat';
import { recoverStalledJobs } from '@/lib/stalled-job-recovery';
import { Cpu, Activity, RefreshCcw, Loader2 } from 'lucide-react';
import { useOrg } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';

function ageLabel(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms/1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms/60_000)}m ago`;
  return `${Math.floor(ms/3_600_000)}h ago`;
}

export default function PlatformWorkers() {
  const { runs } = useJobRuns();
  const { workers, reload } = useWorkers();
  const { runs: schedRuns } = useSchedulerRuns();
  const { currentOrg } = useOrg();
  const canRecover = roleAtLeast(currentOrg?.role, 'manager');
  const [busy, setBusy] = useState(false);

  const perWorker = useMemo(() => {
    const byWorker = new Map<string, { runs: number; ok: number; fail: number; totalMs: number; records: number }>();
    for (const r of runs) {
      const w = byWorker.get(r.worker_id) ?? { runs: 0, ok: 0, fail: 0, totalMs: 0, records: 0 };
      w.runs += 1;
      if (r.status === 'completed') w.ok += 1; else w.fail += 1;
      w.totalMs += r.duration_ms;
      w.records += r.records_processed;
      byWorker.set(r.worker_id, w);
    }
    return byWorker;
  }, [runs]);

  const healthy = workers.filter(isHealthy).length;
  const totalRuns = runs.length;
  const avgDuration = totalRuns ? Math.round(runs.reduce((s, r) => s + r.duration_ms, 0) / totalRuns) : 0;
  const recovered = schedRuns.reduce((s, r) => s + r.jobs_executed, 0);

  const onRecover = async () => {
    setBusy(true);
    try { await recoverStalledJobs(); reload(); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Workers"
        subtitle="Durable workers · heartbeats from worker-dispatcher edge function, scheduler dispatch every minute."
        actions={
          <button onClick={onRecover} disabled={!canRecover || busy}
            className="inline-flex items-center gap-1.5 rounded border bg-card text-[12px] px-3 py-1.5 hover:bg-muted disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Recover Stalled
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Registered',  value: workers.length.toString() },
        { label: 'Healthy',     value: healthy.toString(), tone: healthy > 0 ? 'status-paid' : 'status-denied' },
        { label: 'Total Runs',  value: totalRuns.toString() },
        { label: 'Avg Duration', value: avgDuration ? `${avgDuration}ms` : '—' },
        { label: 'Scheduler Runs', value: schedRuns.length.toString() },
        { label: 'Jobs Executed (scheduler)', value: recovered.toString() },
      ]} />

      <ScrollBody>
        <div className="p-6 space-y-4">
          <Panel title="Worker Registry">
            {workers.length === 0 ? (
              <div className="p-6 text-[12px] text-muted-foreground">
                No registered workers yet. Trigger the worker-dispatcher edge function or wait for the scheduler.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Worker</th>
                    <th className="text-left px-3 py-2">Version</th>
                    <th className="text-left px-3 py-2">Health</th>
                    <th className="text-left px-3 py-2">Heartbeat</th>
                    <th className="text-left px-3 py-2">Lifetime ok</th>
                    <th className="text-left px-3 py-2">Lifetime fail</th>
                    <th className="text-left px-3 py-2">Session runs</th>
                    <th className="text-left px-3 py-2">Session avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map(w => {
                    const pw = perWorker.get(w.worker_id);
                    return (
                      <tr key={w.worker_id} className="border-t">
                        <td className="px-3 py-2 font-mono">{w.worker_id}</td>
                        <td className="px-3 py-2 text-muted-foreground">{w.version}</td>
                        <td className="px-3 py-2">
                          <span className={isHealthy(w) ? 'status-paid' : 'status-denied'}>
                            {isHealthy(w) ? 'healthy' : 'stale'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{ageLabel(heartbeatAgeMs(w))}</td>
                        <td className="px-3 py-2 text-status-paid">{w.jobs_processed}</td>
                        <td className="px-3 py-2 text-status-denied">{w.jobs_failed}</td>
                        <td className="px-3 py-2">{pw?.runs ?? 0}</td>
                        <td className="px-3 py-2">{pw && pw.runs ? Math.round(pw.totalMs / pw.runs) : 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Scheduler Runs">
            {schedRuns.length === 0 ? (
              <div className="p-6 text-[12px] text-muted-foreground">No scheduler activity yet.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Started</th>
                    <th className="text-left px-3 py-2">Scheduler</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Discovered</th>
                    <th className="text-left px-3 py-2">Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {schedRuns.slice(0, 25).map(r => (
                    <tr key={r.run_id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{new Date(r.started_at).toLocaleTimeString()}</td>
                      <td className="px-3 py-2 font-mono">{r.scheduler_name}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.jobs_discovered}</td>
                      <td className="px-3 py-2">{r.jobs_executed}</td>
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
