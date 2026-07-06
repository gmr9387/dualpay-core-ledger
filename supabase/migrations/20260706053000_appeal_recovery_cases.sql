CREATE TABLE IF NOT EXISTS public.appeal_recovery_cases (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  claim_id text NOT NULL,
  current_state text NOT NULL CHECK (
    current_state IN (
      'denied',
      'packet_ready',
      'review_requested',
      'core_decision_received',
      'approval_required',
      'approval_workflow_launched',
      'approved_for_submission',
      'submitted_manual_delivery',
      'payer_response_received',
      'recovered',
      'lost',
      'written_off'
    )
  ),
  assigned_to_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  packet_id text NULL,
  core_trace_id text NULL,
  core_decision_outcome text NULL,
  core_dispatch_status text NULL,
  glue_run_id text NULL,
  payer_response_status text NULL,
  recovered_amount_cents integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, claim_id)
);

CREATE INDEX IF NOT EXISTS appeal_recovery_cases_org_id_idx
  ON public.appeal_recovery_cases (organization_id);

CREATE INDEX IF NOT EXISTS appeal_recovery_cases_org_claim_idx
  ON public.appeal_recovery_cases (organization_id, claim_id);

CREATE INDEX IF NOT EXISTS appeal_recovery_cases_state_idx
  ON public.appeal_recovery_cases (current_state);

CREATE INDEX IF NOT EXISTS appeal_recovery_cases_assigned_to_user_id_idx
  ON public.appeal_recovery_cases (assigned_to_user_id);

ALTER TABLE public.appeal_recovery_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appeal_recovery_cases_select ON public.appeal_recovery_cases;
CREATE POLICY appeal_recovery_cases_select
  ON public.appeal_recovery_cases
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS appeal_recovery_cases_insert ON public.appeal_recovery_cases;
CREATE POLICY appeal_recovery_cases_insert
  ON public.appeal_recovery_cases
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

DROP POLICY IF EXISTS appeal_recovery_cases_update ON public.appeal_recovery_cases;
CREATE POLICY appeal_recovery_cases_update
  ON public.appeal_recovery_cases
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

DROP POLICY IF EXISTS appeal_recovery_cases_delete ON public.appeal_recovery_cases;
CREATE POLICY appeal_recovery_cases_delete
  ON public.appeal_recovery_cases
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['manager','admin','owner']));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appeal_recovery_cases TO authenticated;
GRANT ALL ON public.appeal_recovery_cases TO service_role;

CREATE OR REPLACE FUNCTION public.appeal_recovery_cases_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS appeal_recovery_cases_touch_updated_at ON public.appeal_recovery_cases;
CREATE TRIGGER appeal_recovery_cases_touch_updated_at
BEFORE UPDATE ON public.appeal_recovery_cases
FOR EACH ROW EXECUTE FUNCTION public.appeal_recovery_cases_touch_updated_at();
