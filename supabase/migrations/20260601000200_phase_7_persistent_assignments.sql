-- Phase 7 — Persistent Assignments
-- Moves Claim Clarity assignment/work-status state from localStorage to Supabase.

CREATE TABLE IF NOT EXISTS public.claim_assignments (
  claim_id text PRIMARY KEY REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  assignee text NULL,
  status text NOT NULL DEFAULT 'open',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT claim_assignments_status_check
    CHECK (status IN ('open', 'in_progress', 'snoozed', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_claim_assignments_status
  ON public.claim_assignments (status);

CREATE INDEX IF NOT EXISTS idx_claim_assignments_assignee
  ON public.claim_assignments (assignee);

ALTER TABLE public.claim_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.claim_assignments TO authenticated;
GRANT ALL ON public.claim_assignments TO service_role;

CREATE POLICY claim_assignments_select_authenticated
  ON public.claim_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY claim_assignments_insert_authenticated
  ON public.claim_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY claim_assignments_update_authenticated
  ON public.claim_assignments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_claim_assignments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_claim_assignments ON public.claim_assignments;
CREATE TRIGGER touch_claim_assignments
BEFORE UPDATE ON public.claim_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_claim_assignments_updated_at();