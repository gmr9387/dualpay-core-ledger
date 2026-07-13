/**
 * Phase 18 — Stalled job recovery client trigger.
 *
 * Server-side recovery runs every minute via the scheduler; this helper lets
 * the UI request an immediate recovery sweep for admins / managers via the
 * security-definer SQL function.
 */
import { supabase } from '@/integrations/supabase/client';
import { appendOpsEvent } from '@/lib/ops-events';

export async function recoverStalledJobs(staleMinutes = 10): Promise<number> {
  const { data, error } = await supabase.functions.invoke('worker-dispatcher', {
    body: {
      max: 0,
      recover_only: true,
      stale_minutes: staleMinutes,
      worker_id: `ui-${crypto.randomUUID().slice(0, 8)}`,
    },
  });
  if (error) {
    console.warn('[stalled-recovery] failed', error.message);
    return 0;
  }
  const count = Number((data as { stalled_recovered?: unknown } | null)?.stalled_recovered ?? 0);
  if (count > 0) {
    await appendOpsEvent({
      kind: 'stalled_job_recovered',
      summary: `Recovered ${count} stalled job(s)`,
      payload: { count, stale_minutes: staleMinutes },
    });
  }
  return count;
}
