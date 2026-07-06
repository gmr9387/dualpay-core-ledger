-- =========================================================
-- Appeal Recovery Cases
-- =========================================================
-- Tracks the full lifecycle of an appeal-based recovery case
-- per organization and claim, from initial filing through
-- payer response and final recovered amount.
-- =========================================================

CREATE TABLE public.appeal_recovery_cases (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  claim_id              text        NOT NULL,
  current_state         text        NOT NULL DEFAULT 'denied',
  assigned_to_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  packet_id             text,
  core_trace_id         text,
  core_decision_outcome text,
  core_dispatch_status  text,
  glue_run_id           text,
  payer_response_status text,
  recovered_amount_cents bigint     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appeal_recovery_cases_org_claim_unique UNIQUE (organization_id, claim_id)
);

-- ── Indexes ──────────────────────────────────────────────
CREATE INDEX idx_appeal_recovery_cases_org
  ON public.appeal_recovery_cases(organization_id);

CREATE INDEX idx_appeal_recovery_cases_claim
  ON public.appeal_recovery_cases(claim_id);

CREATE INDEX idx_appeal_recovery_cases_org_state
  ON public.appeal_recovery_cases(organization_id, current_state);

CREATE INDEX idx_appeal_recovery_cases_assigned_to
  ON public.appeal_recovery_cases(assigned_to_user_id);

CREATE INDEX idx_appeal_recovery_cases_created_at
  ON public.appeal_recovery_cases(created_at DESC);

-- ── updated_at trigger ───────────────────────────────────
CREATE TRIGGER appeal_recovery_cases_touch
  BEFORE UPDATE ON public.appeal_recovery_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Auto-default organization_id from current session ────
CREATE OR REPLACE FUNCTION public.set_appeal_recovery_cases_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appeal_recovery_cases_set_org
  BEFORE INSERT ON public.appeal_recovery_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_appeal_recovery_cases_org_id();

-- ── Grants ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appeal_recovery_cases TO authenticated;
GRANT ALL ON public.appeal_recovery_cases TO service_role;

-- ── Row-Level Security ───────────────────────────────────
ALTER TABLE public.appeal_recovery_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appeal_recovery_cases_select" ON public.appeal_recovery_cases
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "appeal_recovery_cases_insert" ON public.appeal_recovery_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
  );

CREATE POLICY "appeal_recovery_cases_update" ON public.appeal_recovery_cases
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));

CREATE POLICY "appeal_recovery_cases_delete" ON public.appeal_recovery_cases
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['manager','admin','owner']));
