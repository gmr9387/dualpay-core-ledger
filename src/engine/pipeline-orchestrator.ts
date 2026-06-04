/**
 * Phase 16 — Pipeline Orchestrator.
 *
 * Chains automation jobs into a single end-to-end recovery pipeline with a
 * shared pipeline_id (traceable via automation_jobs.pipeline_id).
 *
 * Default chain:
 *   remittance_analysis → contract_matching → underpayment_detection
 *   → dispute_generation → recovery_case_generation → queue_assignment
 *   → executive_recalculation
 */
import { startJob, completeJob, failJob } from '@/lib/automation';
import { appendOpsEvent } from '@/lib/ops-events';
import { runJob, JOB_TYPES } from './job-runner';
import type { JobType, AutomationJob } from '@/types/automation';

export interface PipelineRunResult {
  pipeline_id: string;
  pipeline_job: AutomationJob | null;
  steps: Array<{ job_type: JobType; ok: boolean; records: number; recovery_cents: number }>;
}

export async function runRecoveryPipeline(
  steps: Array<Exclude<JobType, 'pipeline'>> = JOB_TYPES,
): Promise<PipelineRunResult> {
  const pipeline_id = crypto.randomUUID();
  const pipelineJob = await startJob('pipeline', { pipeline_id, config: { steps } });
  await appendOpsEvent({
    kind: 'pipeline_started',
    summary: `Recovery pipeline started (${steps.length} steps)`,
    payload: { pipeline_id, steps },
  });

  const stepResults: PipelineRunResult['steps'] = [];
  let processed = 0; let succeeded = 0; let failed = 0; let valueCents = 0;

  for (const job_type of steps) {
    const result = await runJob(job_type, { pipeline_id, parent_job_id: pipelineJob?.job_id });
    const ok = result?.status === 'completed';
    const records = result?.records_processed ?? 0;
    const rec = result?.recovery_value_cents ?? 0;
    stepResults.push({ job_type, ok, records, recovery_cents: rec });
    processed += records;
    succeeded += result?.records_succeeded ?? 0;
    failed += result?.records_failed ?? 0;
    valueCents += rec;
    if (!ok) break;
  }

  let finalJob: AutomationJob | null = pipelineJob;
  if (pipelineJob) {
    const allOk = stepResults.every(s => s.ok);
    if (allOk) {
      finalJob = await completeJob(pipelineJob.job_id, {
        records_processed: processed,
        records_succeeded: succeeded,
        records_failed: failed,
        recovery_value_cents: valueCents,
        details: { steps: stepResults },
      });
    } else {
      await failJob(pipelineJob.job_id, 'One or more pipeline steps failed');
    }
  }

  await appendOpsEvent({
    kind: 'pipeline_completed',
    summary: `Recovery pipeline finished — ${stepResults.filter(s => s.ok).length}/${steps.length} steps ok`,
    payload: { pipeline_id, recovery_cents: valueCents },
  });

  return { pipeline_id, pipeline_job: finalJob, steps: stepResults };
}
