
-- automation_jobs
CREATE TABLE public.automation_jobs (
  job_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_succeeded INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  recovery_value_cents BIGINT NOT NULL DEFAULT 0,
  pipeline_id UUID,
  parent_job_id UUID,
  config JSONB,
  result JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;

ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_jobs_select" ON public.automation_jobs
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "automation_jobs_insert" ON public.automation_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));

CREATE POLICY "automation_jobs_update" ON public.automation_jobs
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));

CREATE POLICY "automation_jobs_delete" ON public.automation_jobs
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE TRIGGER set_automation_jobs_org BEFORE INSERT ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER touch_automation_jobs BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_automation_jobs_org_started ON public.automation_jobs(org_id, started_at DESC);
CREATE INDEX idx_automation_jobs_pipeline ON public.automation_jobs(pipeline_id);

-- automation_rules
CREATE TABLE public.automation_rules (
  rule_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_rules_select" ON public.automation_rules
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "automation_rules_insert" ON public.automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE POLICY "automation_rules_update" ON public.automation_rules
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE POLICY "automation_rules_delete" ON public.automation_rules
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE TRIGGER set_automation_rules_org BEFORE INSERT ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER touch_automation_rules BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_automation_rules_org ON public.automation_rules(org_id, enabled);
