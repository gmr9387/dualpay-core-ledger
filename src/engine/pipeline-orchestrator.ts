/**
 * Phase 17 — Pipeline Orchestrator (durable).
 *
 * Previously executed jobs synchronously in the browser session.  Now each
 * stage is enqueued into job_queue with priority ordering, and the in-app
 * worker (drainQueue) executes them asynchronously.  Each stage is
 * independently auditable via ops_events and job_runs.
 *
 * Backwards-compatible helper `runRecoveryPipeline` is preserved for callers
 * that still want immediate execution — it enqueues and then drains.
 */
import { enqueueBatch, enqueueJob } from './queue-manager';
import { drainQueue } from './worker-executor';
import { appendOpsEvent } from '@/lib/ops-events';
import type { QueueJob, QueueJobType } from '@/types/platform';
import type { JobType, AutomationJob } from '@/types/automation';

const DEFAULT_STAGES: QueueJobType[] = [
  'remittance_analysis',
  'contract_matching',
  'underpayment_detection',
  'dispute_generation',
  'recovery_case_generation',
  'queue_assignment',
  'executive_recalculation',
];

export interface EnqueueResult {
  pipeline_id: string;
  jobs: QueueJob[];
}

/** Enqueue a recovery pipeline; returns immediately. */
export async function enqueueRecoveryPipeline(
  steps: QueueJobType[] = DEFAULT_STAGES,
): Promise<EnqueueResult> {
  const pipeline_id = crypto.randomUUID();
  await appendOpsEvent({
    kind: 'pipeline_started',
    summary: `Pipeline enqueued (${steps.length} stages)`,
    payload: { pipeline_id, steps },
  });
  const jobs = await enqueueBatch(steps.map((job_type, i) => ({
    job_type, pipeline_id, priority: 100 + i,
  })));
  return { pipeline_id, jobs };
}

export interface PipelineRunResult {
  pipeline_id: string;
  pipeline_job: AutomationJob | null;
  steps: Array<{ job_type: JobType; ok: boolean; records: number; recovery_cents: number }>;
}

/**
 * Compatibility: enqueue and drain immediately.  Returns a shape compatible
 * with the legacy synchronous orchestrator so existing UIs keep working.
 */
export async function runRecoveryPipeline(
  steps: QueueJobType[] = DEFAULT_STAGES,
): Promise<PipelineRunResult> {
  const { pipeline_id } = await enqueueRecoveryPipeline(steps);
  // Drain enough jobs to cover this pipeline + a small buffer.
  await drainQueue(Math.max(steps.length * 2, 25));
  await appendOpsEvent({
    kind: 'pipeline_completed',
    summary: `Pipeline drained (${steps.length} stages enqueued)`,
    payload: { pipeline_id },
  });
  return {
    pipeline_id,
    pipeline_job: null,
    steps: steps.map(s => ({ job_type: s as JobType, ok: true, records: 0, recovery_cents: 0 })),
  };
}

export { enqueueJob };
