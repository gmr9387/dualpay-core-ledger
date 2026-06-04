-- ===================== job_queue =====================
CREATE TABLE public.job_queue (
  queue_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  pipeline_id uuid,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 100,
  payload jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  worker_id text,
  locked_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_queue TO authenticated;
GRANT ALL ON public.job_queue TO service_role;

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_queue select org members" ON public.job_queue
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "job_queue insert analysts" ON public.job_queue
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

CREATE POLICY "job_queue update managers" ON public.job_queue
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

CREATE POLICY "job_queue delete admins" ON public.job_queue
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner']));

CREATE TRIGGER job_queue_set_org BEFORE INSERT ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER job_queue_touch BEFORE UPDATE ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX job_queue_status_priority_idx ON public.job_queue (status, priority, next_attempt_at);
CREATE INDEX job_queue_org_idx ON public.job_queue (org_id);
CREATE INDEX job_queue_pipeline_idx ON public.job_queue (pipeline_id);

-- ===================== job_runs =====================
CREATE TABLE public.job_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  queue_job_id uuid NOT NULL REFERENCES public.job_queue(queue_job_id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  result_summary jsonb,
  records_processed integer NOT NULL DEFAULT 0,
  records_succeeded integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_runs select org members" ON public.job_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "job_runs insert analysts" ON public.job_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

CREATE TRIGGER job_runs_set_org BEFORE INSERT ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX job_runs_queue_job_idx ON public.job_runs (queue_job_id);
CREATE INDEX job_runs_org_idx ON public.job_runs (org_id);

-- ===================== job_failures =====================
CREATE TABLE public.job_failures (
  failure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  queue_job_id uuid NOT NULL REFERENCES public.job_queue(queue_job_id) ON DELETE CASCADE,
  error_message text NOT NULL,
  stack_trace text,
  retry_count integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_failures TO authenticated;
GRANT ALL ON public.job_failures TO service_role;

ALTER TABLE public.job_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_failures select org members" ON public.job_failures
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "job_failures insert analysts" ON public.job_failures
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

CREATE POLICY "job_failures update managers" ON public.job_failures
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']));

CREATE POLICY "job_failures delete admins" ON public.job_failures
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner']));

CREATE TRIGGER job_failures_set_org BEFORE INSERT ON public.job_failures
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX job_failures_queue_job_idx ON public.job_failures (queue_job_id);
CREATE INDEX job_failures_org_idx ON public.job_failures (org_id);
