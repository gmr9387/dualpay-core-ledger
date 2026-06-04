// Phase 18 — Worker Dispatcher Edge Function.
// Polls job_queue, atomically claims jobs, executes them server-side, records
// metrics + heartbeat, and reports stalled-job recovery counts.
// Triggered by pg_cron via scheduler-dispatcher every minute, or manually.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface QueueJob {
  queue_job_id: string;
  org_id: string;
  pipeline_id: string | null;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
}

const WORKER_VERSION = '18.0.0';

async function registerWorker(client: ReturnType<typeof createClient>, worker_id: string) {
  await client.from('worker_registry').upsert({
    worker_id, status: 'active', version: WORKER_VERSION, last_heartbeat: new Date().toISOString(),
  } as never, { onConflict: 'worker_id' });
  await client.from('ops_events').insert([{
    event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
    occurred_at: new Date().toISOString(),
    kind: 'worker_registered',
    actor: 'system:worker-dispatcher',
    summary: `Worker ${worker_id} registered`,
    payload: { worker_id, version: WORKER_VERSION },
  }] as never);
}

async function heartbeat(client: ReturnType<typeof createClient>, worker_id: string, ok: number, fail: number) {
  const { data } = await client.from('worker_registry').select('jobs_processed, jobs_failed').eq('worker_id', worker_id).maybeSingle();
  const next_ok = ((data?.jobs_processed as number | undefined) ?? 0) + ok;
  const next_fail = ((data?.jobs_failed as number | undefined) ?? 0) + fail;
  await client.from('worker_registry').update({
    status: 'active',
    last_heartbeat: new Date().toISOString(),
    jobs_processed: next_ok,
    jobs_failed: next_fail,
  } as never).eq('worker_id', worker_id);
  await client.from('ops_events').insert([{
    event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
    occurred_at: new Date().toISOString(),
    kind: 'worker_heartbeat',
    actor: 'system:worker-dispatcher',
    summary: `Heartbeat ${worker_id} (+${ok} ok, +${fail} fail)`,
    payload: { worker_id, ok, fail },
  }] as never);
}

// ---------- Job handlers (mirror Phase 16 deterministic logic, server-side) ----------

async function runHandler(client: ReturnType<typeof createClient>, job: QueueJob): Promise<{
  records_processed: number; records_succeeded: number; records_failed: number;
  recovery_value_cents: number; details: Record<string, unknown>;
}> {
  const k = job.job_type;
  if (k === 'remittance_analysis') {
    const { data } = await client.from('remittance_batches').select('status').eq('org_id', job.org_id);
    const rows = (data ?? []) as Array<{ status: string }>;
    const ok = rows.filter(r => r.status === 'completed' || r.status === 'processed').length;
    return { records_processed: rows.length, records_succeeded: ok, records_failed: rows.length - ok, recovery_value_cents: 0, details: { batches: rows.length } };
  }
  if (k === 'contract_matching') {
    const [{ data: claims }, { data: contracts }] = await Promise.all([
      client.from('claims').select('payer_name').eq('org_id', job.org_id),
      client.from('payer_contracts').select('payer_name').eq('org_id', job.org_id),
    ]);
    const set = new Set(((contracts ?? []) as Array<{ payer_name: string }>).map(c => (c.payer_name ?? '').toLowerCase()));
    const rows = (claims ?? []) as Array<{ payer_name: string | null }>;
    const matched = rows.filter(c => c.payer_name && set.has(c.payer_name.toLowerCase())).length;
    return { records_processed: rows.length, records_succeeded: matched, records_failed: rows.length - matched, recovery_value_cents: 0, details: { matched } };
  }
  if (k === 'underpayment_detection') {
    const { data } = await client.from('underpayment_disputes').select('variance_amount_cents, status').eq('org_id', job.org_id);
    const rows = (data ?? []) as Array<{ variance_amount_cents: number | null; status: string }>;
    const value = rows.reduce((s, r) => s + (r.variance_amount_cents ?? 0), 0);
    return { records_processed: rows.length, records_succeeded: rows.length, records_failed: 0, recovery_value_cents: value, details: { open: rows.filter(r => r.status === 'open').length } };
  }
  if (k === 'dispute_generation') {
    // Server-side dispute generation requires candidate payload supplied by the user / pipeline.
    const candidates = (job.payload?.candidates as Array<Record<string, unknown>> | undefined) ?? [];
    return { records_processed: candidates.length, records_succeeded: 0, records_failed: 0, recovery_value_cents: 0, details: { note: 'dispute generation deferred to UI session', candidates: candidates.length } };
  }
  if (k === 'recovery_case_generation') {
    const { data: disputes } = await client.from('underpayment_disputes')
      .select('claim_id, severity, status, payer_name, variance_percent')
      .eq('org_id', job.org_id).in('severity', ['high', 'critical']).eq('status', 'open');
    const open = (disputes ?? []) as Array<{ claim_id: string; payer_name: string; variance_percent: number }>;
    const { data: links } = await client.from('case_claim_links').select('claim_id').eq('org_id', job.org_id);
    const linked = new Set(((links ?? []) as Array<{ claim_id: string }>).map(r => r.claim_id));
    const targets = open.filter(o => !linked.has(o.claim_id));
    let created = 0;
    for (const t of targets) {
      const { data: c } = await client.from('cases').insert([{
        org_id: job.org_id, trigger: 'major_underpayment', status: 'open',
        description: `Auto-case for ${t.payer_name} underpayment (${t.variance_percent?.toFixed?.(1) ?? '?'}%)`,
      }] as never).select('case_id').single();
      if (c) {
        await client.from('case_claim_links').insert([{ case_id: (c as any).case_id, claim_id: t.claim_id, org_id: job.org_id }] as never);
        created += 1;
      }
    }
    return { records_processed: targets.length, records_succeeded: created, records_failed: targets.length - created, recovery_value_cents: 0, details: { cases_created: created } };
  }
  if (k === 'queue_assignment') {
    const { data: disputes } = await client.from('underpayment_disputes')
      .select('claim_id').eq('org_id', job.org_id).eq('status', 'open');
    const { data: assigns } = await client.from('claim_assignments').select('claim_id').eq('org_id', job.org_id);
    const assigned = new Set(((assigns ?? []) as Array<{ claim_id: string }>).map(r => r.claim_id));
    const queue = ((disputes ?? []) as Array<{ claim_id: string }>).filter(d => !assigned.has(d.claim_id));
    const ASSIGNEES = ['analyst-1','analyst-2','analyst-3'];
    let ok = 0;
    for (let i = 0; i < queue.length; i++) {
      const { error } = await client.from('claim_assignments').insert([{
        claim_id: queue[i].claim_id, assignee: ASSIGNEES[i % ASSIGNEES.length], status: 'open', org_id: job.org_id,
      }] as never);
      if (!error) ok += 1;
    }
    return { records_processed: queue.length, records_succeeded: ok, records_failed: queue.length - ok, recovery_value_cents: 0, details: { round_robin_size: ASSIGNEES.length } };
  }
  if (k === 'executive_recalculation') {
    const [{ count: cl }, { count: oc }, { count: di }] = await Promise.all([
      client.from('claims').select('*', { count: 'exact', head: true }).eq('org_id', job.org_id),
      client.from('recovery_outcomes').select('*', { count: 'exact', head: true }).eq('org_id', job.org_id),
      client.from('underpayment_disputes').select('*', { count: 'exact', head: true }).eq('org_id', job.org_id),
    ]);
    const total = (cl ?? 0) + (oc ?? 0) + (di ?? 0);
    return { records_processed: total, records_succeeded: total, records_failed: 0, recovery_value_cents: 0, details: { claims: cl, outcomes: oc, disputes: di } };
  }
  throw new Error(`Unknown job_type ${k}`);
}

async function executeOne(client: ReturnType<typeof createClient>, worker_id: string, job: QueueJob): Promise<{ ok: boolean; error?: string }> {
  const start = Date.now();
  try {
    const r = await runHandler(client, job);
    const duration_ms = Date.now() - start;
    await client.from('job_queue').update({
      status: 'completed', completed_at: new Date().toISOString(), last_error: null,
    } as never).eq('queue_job_id', job.queue_job_id);
    await client.from('job_runs').insert([{
      queue_job_id: job.queue_job_id, worker_id, duration_ms, status: 'completed',
      records_processed: r.records_processed, records_succeeded: r.records_succeeded,
      records_failed: r.records_failed, result_summary: r.details, org_id: job.org_id,
    }] as never);
    // also keep automation_jobs in sync (best-effort) so dashboards stay consistent
    await client.from('automation_jobs').insert([{
      job_type: job.job_type, status: 'completed', org_id: job.org_id,
      started_at: new Date(start).toISOString(), completed_at: new Date().toISOString(),
      records_processed: r.records_processed, records_succeeded: r.records_succeeded,
      records_failed: r.records_failed, recovery_value_cents: r.recovery_value_cents,
      pipeline_id: job.pipeline_id, result: r.details,
    }] as never);
    await client.from('ops_events').insert([{
      event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
      occurred_at: new Date().toISOString(), kind: 'job_completed',
      actor: `system:${worker_id}`,
      summary: `Job completed: ${job.job_type} (${r.records_succeeded}/${r.records_processed})`,
      payload: { queue_job_id: job.queue_job_id, worker_id, ...r },
    }] as never);
    return { ok: true };
  } catch (e: any) {
    const duration_ms = Date.now() - start;
    const message = e?.message ?? String(e);
    await client.from('job_runs').insert([{
      queue_job_id: job.queue_job_id, worker_id, duration_ms, status: 'failed',
      records_processed: 0, records_succeeded: 0, records_failed: 0,
      result_summary: { error: message }, org_id: job.org_id,
    }] as never);
    await client.from('job_failures').insert([{
      queue_job_id: job.queue_job_id, error_message: message, retry_count: job.attempts, org_id: job.org_id,
    }] as never);
    const exhausted = job.attempts >= job.max_attempts;
    if (exhausted) {
      await client.from('job_queue').update({
        status: 'dead_letter', completed_at: new Date().toISOString(), last_error: message,
      } as never).eq('queue_job_id', job.queue_job_id);
      await client.from('ops_events').insert([{
        event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
        occurred_at: new Date().toISOString(), kind: 'job_dead_lettered',
        actor: `system:${worker_id}`,
        summary: `Dead-lettered ${job.job_type} after ${job.attempts} attempts`,
        payload: { queue_job_id: job.queue_job_id, error: message },
      }] as never);
    } else {
      const backoffMs = Math.min(2 ** job.attempts * 1000, 300_000);
      await client.from('job_queue').update({
        status: 'queued', worker_id: null, locked_at: null, last_error: message,
        next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
      } as never).eq('queue_job_id', job.queue_job_id);
      await client.from('ops_events').insert([{
        event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
        occurred_at: new Date().toISOString(), kind: 'job_retried',
        actor: `system:${worker_id}`,
        summary: `Retry scheduled for ${job.job_type}`,
        payload: { queue_job_id: job.queue_job_id, attempt: job.attempts, backoffMs },
      }] as never);
    }
    return { ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const maxJobs = Math.max(1, Math.min(50, Number(url.searchParams.get('max') ?? '10')));
  const worker_id = url.searchParams.get('worker_id') ?? `srv-${crypto.randomUUID().slice(0,8)}`;

  const client = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  await registerWorker(client, worker_id);

  // Recover any stalled jobs from dead workers before claiming.
  const { data: recovered } = await client.rpc('recover_stalled_queue_jobs', { _stale_minutes: 10 } as never);
  if ((recovered as unknown as number) > 0) {
    await client.from('ops_events').insert([{
      event_id: `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`,
      occurred_at: new Date().toISOString(), kind: 'stalled_job_recovered',
      actor: `system:${worker_id}`,
      summary: `Recovered ${recovered} stalled job(s)`,
      payload: { count: recovered },
    }] as never);
  }

  let executed = 0, ok = 0, fail = 0;
  for (let i = 0; i < maxJobs; i++) {
    const { data: job, error } = await client.rpc('claim_next_queue_job', { _worker_id: worker_id } as never);
    if (error || !job) break;
    const j = job as unknown as QueueJob;
    if (!j.queue_job_id) break;
    executed += 1;
    const r = await executeOne(client, worker_id, j);
    if (r.ok) ok += 1; else fail += 1;
  }

  await heartbeat(client, worker_id, ok, fail);

  return new Response(JSON.stringify({
    worker_id, executed, ok, fail, stalled_recovered: recovered ?? 0,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
});
