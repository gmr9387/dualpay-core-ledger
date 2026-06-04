-- ===================== worker_registry =====================
CREATE TABLE public.worker_registry (
  worker_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  version text NOT NULL DEFAULT '1.0.0',
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  jobs_processed integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.worker_registry TO authenticated;
GRANT ALL ON public.worker_registry TO service_role;

ALTER TABLE public.worker_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worker_registry read all authenticated" ON public.worker_registry
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER worker_registry_touch BEFORE UPDATE ON public.worker_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX worker_registry_heartbeat_idx ON public.worker_registry (last_heartbeat DESC);

-- ===================== scheduler_runs =====================
CREATE TABLE public.scheduler_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduler_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  jobs_discovered integer NOT NULL DEFAULT 0,
  jobs_executed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scheduler_runs TO authenticated;
GRANT ALL ON public.scheduler_runs TO service_role;

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduler_runs read all authenticated" ON public.scheduler_runs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX scheduler_runs_started_idx ON public.scheduler_runs (started_at DESC);

-- ===================== atomic claim helper =====================
CREATE OR REPLACE FUNCTION public.claim_next_queue_job(_worker_id text)
RETURNS public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.job_queue;
BEGIN
  UPDATE public.job_queue q
     SET status = 'running',
         worker_id = _worker_id,
         locked_at = now(),
         started_at = COALESCE(q.started_at, now()),
         attempts = q.attempts + 1
   WHERE q.queue_job_id = (
     SELECT queue_job_id
       FROM public.job_queue
      WHERE status = 'queued'
        AND next_attempt_at <= now()
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_queue_job(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_queue_job(text) TO service_role;

-- ===================== stalled job recovery =====================
CREATE OR REPLACE FUNCTION public.recover_stalled_queue_jobs(_stale_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recovered integer;
BEGIN
  WITH stalled AS (
    SELECT q.queue_job_id
      FROM public.job_queue q
      LEFT JOIN public.worker_registry w ON w.worker_id = q.worker_id
     WHERE q.status = 'running'
       AND q.locked_at < now() - (_stale_minutes || ' minutes')::interval
       AND (w.worker_id IS NULL OR w.last_heartbeat < now() - (_stale_minutes || ' minutes')::interval)
  ), upd AS (
    UPDATE public.job_queue q
       SET status = 'queued',
           worker_id = NULL,
           locked_at = NULL,
           last_error = COALESCE(last_error, 'stalled — recovered'),
           next_attempt_at = now()
     FROM stalled s
     WHERE q.queue_job_id = s.queue_job_id
    RETURNING q.queue_job_id
  )
  SELECT count(*) INTO recovered FROM upd;
  RETURN recovered;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) TO service_role;
