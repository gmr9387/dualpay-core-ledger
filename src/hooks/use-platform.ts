import { useEffect, useState, useCallback } from 'react';
import {
  listQueueJobs, listJobRuns, listJobFailures, QUEUE_EVENT,
} from '@/engine/queue-manager';
import type { QueueJob, JobRun, JobFailure } from '@/types/platform';

export function useQueueJobs() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    listQueueJobs().then(j => { setJobs(j); setLoading(false); });
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(QUEUE_EVENT, reload);
    return () => window.removeEventListener(QUEUE_EVENT, reload);
  }, [reload]);
  return { jobs, loading, reload };
}

export function useJobRuns() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const reload = useCallback(() => { listJobRuns().then(setRuns); }, []);
  useEffect(() => {
    reload();
    window.addEventListener(QUEUE_EVENT, reload);
    return () => window.removeEventListener(QUEUE_EVENT, reload);
  }, [reload]);
  return { runs, reload };
}

export function useJobFailures(includeArchived = false) {
  const [failures, setFailures] = useState<JobFailure[]>([]);
  const reload = useCallback(() => { listJobFailures(includeArchived).then(setFailures); }, [includeArchived]);
  useEffect(() => {
    reload();
    window.addEventListener(QUEUE_EVENT, reload);
    return () => window.removeEventListener(QUEUE_EVENT, reload);
  }, [reload]);
  return { failures, reload };
}

export function platformKpis(jobs: QueueJob[], runs: JobRun[]) {
  const queued    = jobs.filter(j => j.status === 'queued').length;
  const running   = jobs.filter(j => j.status === 'running').length;
  const completed = jobs.filter(j => j.status === 'completed').length;
  const failed    = jobs.filter(j => j.status === 'failed').length;
  const dead      = jobs.filter(j => j.status === 'dead_letter').length;
  const total     = jobs.length;
  const avgDuration = runs.length
    ? Math.round(runs.reduce((s, r) => s + r.duration_ms, 0) / runs.length)
    : 0;
  const successRate = (completed + dead) > 0 ? completed / (completed + dead) : 0;
  return { queued, running, completed, failed, dead, total, avgDuration, successRate };
}
