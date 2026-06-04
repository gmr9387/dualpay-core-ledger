// Phase 18 — Scheduler Dispatcher Edge Function.
// Discovers queued jobs, then triggers the worker-dispatcher to drain them.
// Invoked by pg_cron every minute.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SCHEDULER_NAME = 'minute-tick';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const client = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: started } = await client.from('scheduler_runs').insert([{
    scheduler_name: SCHEDULER_NAME, status: 'running',
  }] as never).select('run_id').single();
  const run_id = (started as any)?.run_id as string | undefined;

  await client.from('ops_events').insert([{
    event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
    occurred_at: new Date().toISOString(), kind: 'scheduler_started',
    actor: 'system:scheduler-dispatcher',
    summary: `Scheduler ${SCHEDULER_NAME} started`,
    payload: { run_id },
  }] as never);

  // Discover work.
  const { count: discovered } = await client.from('job_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued').lte('next_attempt_at', new Date().toISOString());
  const queued = discovered ?? 0;

  // Dispatch to worker-dispatcher (fire-and-await one cycle).
  let executed = 0;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/worker-dispatcher?max=25`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    });
    const body = await resp.json().catch(() => ({}));
    executed = (body?.executed as number) ?? 0;
  } catch (_) { /* swallow; scheduler still completes */ }

  await client.from('scheduler_runs').update({
    status: 'completed', completed_at: new Date().toISOString(),
    jobs_discovered: queued, jobs_executed: executed,
  } as never).eq('run_id', run_id ?? '');

  await client.from('ops_events').insert([{
    event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
    occurred_at: new Date().toISOString(), kind: 'scheduler_completed',
    actor: 'system:scheduler-dispatcher',
    summary: `Scheduler ${SCHEDULER_NAME} completed — discovered ${queued}, executed ${executed}`,
    payload: { run_id, discovered: queued, executed },
  }] as never);

  return new Response(JSON.stringify({ run_id, discovered: queued, executed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
  });
});
