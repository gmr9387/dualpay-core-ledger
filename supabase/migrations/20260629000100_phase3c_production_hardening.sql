-- =========================================================
-- Phase 3C — Production Hardening Pass
-- =========================================================
-- Fixes:
--   C-1  Drop any remaining demo USING(true) policies
--   H-6  Change claim_assignments uniqueness to (claim_id, org_id)
--   H-3  Add snooze_until column to claim_assignments
--   H-1  Add v_appeal_pending_counts view (uses occurred_at ordering)
-- =========================================================

-- =========================================================
-- C-1: Drop remaining demo/open policies on claim_assignments
-- =========================================================
-- Phase 3A migration (20260628_phase3a_operational_workflows.sql) recreated
-- a demo UPDATE policy with USING(true) AFTER the Phase 14 hardening.
-- Drop it and any other open policies that may have slipped through.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_assignments'
      AND (
        -- matches the Phase 3A demo policy
        policyname LIKE '%demo%'
        -- matches Phase 7 open policies (superseded but may still exist on
        -- some deployments if migration order differed)
        OR policyname IN (
          'claim_assignments_select_authenticated',
          'claim_assignments_insert_authenticated',
          'claim_assignments_update_authenticated',
          'claim_assignments_update_demo'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.claim_assignments', pol.policyname);
  END LOOP;
END $$;

-- Ensure the strict org-scoped policies exist (idempotent).
-- If they already exist from Phase 14, these will be no-ops.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='claim_assignments'
      AND policyname='claim_assignments_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY claim_assignments_select ON public.claim_assignments
        FOR SELECT TO authenticated
        USING (public.is_org_member(org_id, auth.uid()))
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='claim_assignments'
      AND policyname='claim_assignments_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY claim_assignments_insert ON public.claim_assignments
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
        )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='claim_assignments'
      AND policyname='claim_assignments_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY claim_assignments_update ON public.claim_assignments
        FOR UPDATE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
        WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='claim_assignments'
      AND policyname='claim_assignments_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY claim_assignments_delete ON public.claim_assignments
        FOR DELETE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']))
    $p$;
  END IF;
END $$;

-- =========================================================
-- H-6: Change claim_assignments uniqueness to (claim_id, org_id)
-- =========================================================
-- The original table used claim_id as PRIMARY KEY (single-tenant assumption).
-- Multi-tenant production requires (claim_id, org_id) composite uniqueness.
--
-- Strategy:
--   1. Add a surrogate UUID primary key column (id) if it doesn't exist.
--   2. Drop the old single-column primary key on claim_id.
--   3. Add UNIQUE constraint on (claim_id, org_id).
--
-- This is safe: all existing rows keep their data; upserts now resolve
-- conflicts on the composite key.

-- Step 1: Add surrogate PK column.
ALTER TABLE public.claim_assignments
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- Step 2: Drop the existing primary key (regardless of its name).
DO $$
DECLARE pk_name text;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.claim_assignments'::regclass
    AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.claim_assignments DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

-- Step 3: Make id the new PK.
ALTER TABLE public.claim_assignments ADD PRIMARY KEY (id);

-- Step 4: Add composite unique constraint for multi-tenant upserts.
ALTER TABLE public.claim_assignments
  DROP CONSTRAINT IF EXISTS claim_assignments_claim_org_unique;

ALTER TABLE public.claim_assignments
  ADD CONSTRAINT claim_assignments_claim_org_unique UNIQUE (claim_id, org_id);

-- Index to support the new composite key efficiently.
CREATE INDEX IF NOT EXISTS idx_claim_assignments_claim_org
  ON public.claim_assignments (claim_id, org_id);

-- =========================================================
-- H-3: Add snooze_until column to claim_assignments
-- =========================================================
-- Required when status = 'snoozed'.  Enforced at the application layer
-- (write-off confirmation, AssignmentPanel guard) and via the DB check below.

ALTER TABLE public.claim_assignments
  ADD COLUMN IF NOT EXISTS snooze_until timestamptz NULL;

-- DB-level guard: snooze_until must be set when status = 'snoozed'.
ALTER TABLE public.claim_assignments
  DROP CONSTRAINT IF EXISTS claim_assignments_snooze_requires_date;

ALTER TABLE public.claim_assignments
  ADD CONSTRAINT claim_assignments_snooze_requires_date
  CHECK (
    status <> 'snoozed' OR snooze_until IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_claim_assignments_snooze_until
  ON public.claim_assignments (snooze_until)
  WHERE snooze_until IS NOT NULL;

-- =========================================================
-- H-1/M-2: View for appeal pending counts (uses occurred_at ordering)
-- =========================================================
-- Returns one row per (claim_id, org_id) with the latest appeal event kind,
-- resolved by MAX(occurred_at).  "Pending" = latest event is appeal_submitted
-- and no later appeal_resolved event exists.

CREATE OR REPLACE VIEW public.v_appeal_pending_counts AS
SELECT
  org_id,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_submitted'
  ) AS pending_count,
  COUNT(*) FILTER (
    WHERE latest_kind IN ('appeal_submitted', 'appeal_responded', 'appeal_resolved')
  ) AS total_count,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_resolved'
      AND latest_payload->>'appeal_status' = 'won'
  ) AS won_count,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_resolved'
      AND latest_payload->>'appeal_status' = 'lost'
  ) AS lost_count
FROM (
  SELECT DISTINCT ON (claim_id, org_id)
    claim_id,
    org_id,
    kind AS latest_kind,
    payload AS latest_payload
  FROM public.ops_events
  WHERE kind IN ('appeal_submitted', 'appeal_responded', 'appeal_resolved')
  ORDER BY claim_id, org_id, occurred_at DESC
) latest_per_claim
GROUP BY org_id;

GRANT SELECT ON public.v_appeal_pending_counts TO authenticated;
