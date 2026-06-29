-- =========================================================
-- Phase 4D — Security Lockdown Hotfix
-- =========================================================
-- Fixes every P0/P1 blocker surfaced by Phase 4C Sprint 1:
--
--  P0-1  Drop all demo/open USING(true) policies on PHI/financial tables
--  P0-2  Revoke anon grants from all PHI, financial, import, remittance,
--        recovery, and claim tables
--  P0-3  Fix invitations_accept_by_token — no more global USING(true)
--  P1-1  Strict org-scoped policies verified / recreated as needed
--  P1-2  org_id IS NULL visibility confirmed closed (NOT NULL constraint
--        enforced by 20260604210800; this migration re-asserts it)
--
-- NOTE: The strict org-scoped *_select / *_insert / *_update / *_delete
-- policies were already created by migration 20260604210800.
-- This migration only removes the open policies that coexist alongside them
-- and revokes the table-level anon grants.  It is fully idempotent.
-- =========================================================

-- =========================================================
-- P0-1: Drop every demo/open USING(true) policy
-- =========================================================

-- ops_events (Phase 7 + Phase 8e open policies)
DROP POLICY IF EXISTS demo_read_ops_events             ON public.ops_events;
DROP POLICY IF EXISTS demo_insert_ops_events           ON public.ops_events;
DROP POLICY IF EXISTS ops_events_select_authenticated  ON public.ops_events;
DROP POLICY IF EXISTS ops_events_insert_authenticated  ON public.ops_events;

-- claim_assignments (Phase 7 open policies + Phase 3A demo update)
DROP POLICY IF EXISTS demo_read_claim_assignments      ON public.claim_assignments;
DROP POLICY IF EXISTS demo_insert_claim_assignments    ON public.claim_assignments;
DROP POLICY IF EXISTS demo_update_claim_assignments    ON public.claim_assignments;
DROP POLICY IF EXISTS demo_delete_claim_assignments    ON public.claim_assignments;
DROP POLICY IF EXISTS claim_assignments_update_demo    ON public.claim_assignments;
-- catch any remaining open policies Phase 3C may not have seen in some deployments
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_assignments'
      AND policyname LIKE '%demo%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.claim_assignments', pol.policyname);
  END LOOP;
END $$;

-- recovery_outcomes (Phase 8e open policies)
DROP POLICY IF EXISTS demo_read_recovery_outcomes      ON public.recovery_outcomes;
DROP POLICY IF EXISTS demo_insert_recovery_outcomes    ON public.recovery_outcomes;
DROP POLICY IF EXISTS demo_update_recovery_outcomes    ON public.recovery_outcomes;
DROP POLICY IF EXISTS demo_delete_recovery_outcomes    ON public.recovery_outcomes;

-- import_batches (open policies from original import migration)
DROP POLICY IF EXISTS "demo_read_import_batches"       ON public.import_batches;
DROP POLICY IF EXISTS "demo_write_import_batches"      ON public.import_batches;

-- field_mappings
DROP POLICY IF EXISTS "demo_read_field_mappings"       ON public.field_mappings;
DROP POLICY IF EXISTS "demo_write_field_mappings"      ON public.field_mappings;

-- import_exceptions (broad "Authenticated can …" open policies)
DROP POLICY IF EXISTS "Authenticated can read exceptions"   ON public.import_exceptions;
DROP POLICY IF EXISTS "Authenticated can insert exceptions" ON public.import_exceptions;
DROP POLICY IF EXISTS "Authenticated can update exceptions" ON public.import_exceptions;
DROP POLICY IF EXISTS "Authenticated can delete exceptions" ON public.import_exceptions;

-- remittance_batches (open policies from remittance import migration)
DROP POLICY IF EXISTS "remittance_batches read"        ON public.remittance_batches;
DROP POLICY IF EXISTS "remittance_batches insert"      ON public.remittance_batches;
DROP POLICY IF EXISTS "remittance_batches update"      ON public.remittance_batches;
DROP POLICY IF EXISTS "remittance_batches delete"      ON public.remittance_batches;

-- invitations — open accept-by-token policy (replaced below in P0-3)
DROP POLICY IF EXISTS invitations_accept_by_token      ON public.invitations;

-- =========================================================
-- P0-2: Revoke anon grants
-- =========================================================
-- These GRANT statements appeared in early migrations.  REVOKE is
-- idempotent: it's a no-op if the privilege was never granted.

REVOKE SELECT, INSERT                        FROM anon ON public.ops_events;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.claim_assignments;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.recovery_outcomes;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.import_batches;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.field_mappings;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.remittance_batches;
-- Defensive: also revoke from any other PHI/financial tables
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.import_exceptions;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.underpayment_disputes;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.evidence_documents;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.invitations;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.payer_contracts;
REVOKE SELECT, INSERT, UPDATE, DELETE        FROM anon ON public.fee_schedules;

-- =========================================================
-- P0-3: Fix invitations SELECT policy — no global USING(true)
-- =========================================================
-- Old policy allowed ANY authenticated user to read ALL invitations.
-- New policy: a user may only select pending invitations addressed to
-- their own email address (needed for the token-acceptance flow).
-- Org managers/admins/owners continue to use the existing
-- invitations_select policy (has_org_role check) for their org's invites.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_accept_by_token'
  ) THEN
    EXECUTE $p$
      CREATE POLICY invitations_accept_by_token ON public.invitations
        FOR SELECT TO authenticated
        USING (
          email       = auth.email()
          AND status  = 'pending'
          AND expires_at > now()
        )
    $p$;
  END IF;
END $$;

-- =========================================================
-- P1-1: Ensure strict org-scoped policies exist for all tables
-- =========================================================
-- Migration 20260604210800 already created these.  The block below is a
-- safety net for any deployment where that migration ran before the tables
-- were populated (or ran in a different order).

DO $$
DECLARE
  t   text;
  analyst_roles text := 'ARRAY[''analyst'',''manager'',''admin'',''owner'']';
  manager_roles text := 'ARRAY[''manager'',''admin'',''owner'']';
  tables text[] := ARRAY[
    'ops_events', 'claim_assignments', 'recovery_outcomes',
    'import_batches', 'import_exceptions', 'field_mappings',
    'remittance_batches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()))',
        t || '_select', t);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND public.has_org_role(org_id, auth.uid(), %s))',
        t || '_insert', t, analyst_roles);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_org_role(org_id, auth.uid(), %s)) WITH CHECK (public.has_org_role(org_id, auth.uid(), %s))',
        t || '_update', t, analyst_roles, analyst_roles);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_org_role(org_id, auth.uid(), %s))',
        t || '_delete', t, manager_roles);
    END IF;
  END LOOP;
END $$;

-- =========================================================
-- P1-2: Assert org_id IS NOT NULL on all affected tables
-- =========================================================
-- Migration 20260604210800 already set these NOT NULL constraints after
-- backfilling legacy rows to 'Legacy Demo Organization'.  These ALTER
-- statements are idempotent (no-op if already NOT NULL).

ALTER TABLE public.ops_events         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.claim_assignments  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.recovery_outcomes  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.import_batches     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.import_exceptions  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.field_mappings     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.remittance_batches ALTER COLUMN org_id SET NOT NULL;

-- =========================================================
-- Legacy NULL org_id cleanup plan (informational comment)
-- =========================================================
-- If any deployment has rows with org_id IS NULL (e.g. from a partial
-- migration run), execute the following before enabling NOT NULL:
--
--   DO $$
--   DECLARE legacy_org uuid;
--   BEGIN
--     SELECT org_id INTO legacy_org
--     FROM public.organizations WHERE name = 'Legacy Demo Organization' LIMIT 1;
--     IF legacy_org IS NULL THEN
--       INSERT INTO public.organizations(name)
--       VALUES ('Legacy Demo Organization') RETURNING org_id INTO legacy_org;
--     END IF;
--     UPDATE public.ops_events          SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.claim_assignments   SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.recovery_outcomes   SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.import_batches      SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.import_exceptions   SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.field_mappings      SET org_id = legacy_org WHERE org_id IS NULL;
--     UPDATE public.remittance_batches  SET org_id = legacy_org WHERE org_id IS NULL;
--   END $$;

-- =========================================================
-- Verification queries
-- =========================================================
-- Run these after applying the migration to confirm all P0/P1 items pass:
--
-- 1. No open USING(true) policies remain:
--    SELECT tablename, policyname, qual
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND qual = '(true)'
--    ORDER BY tablename, policyname;
--    -- Expected: 0 rows (or only non-PHI/non-financial tables)
--
-- 2. No anon table grants remain on PHI tables:
--    SELECT grantee, table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'anon'
--      AND table_name IN (
--        'ops_events','claim_assignments','recovery_outcomes',
--        'import_batches','field_mappings','remittance_batches',
--        'import_exceptions','underpayment_disputes','evidence_documents',
--        'invitations','payer_contracts','fee_schedules'
--      );
--    -- Expected: 0 rows
--
-- 3. invitations_accept_by_token uses email + expiry check:
--    SELECT policyname, qual
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'invitations'
--      AND policyname = 'invitations_accept_by_token';
--    -- Expected: qual contains 'auth.email()' not '(true)'
--
-- 4. org_id NOT NULL enforced:
--    SELECT table_name, column_name, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND column_name = 'org_id'
--      AND table_name IN (
--        'ops_events','claim_assignments','recovery_outcomes',
--        'import_batches','import_exceptions','field_mappings','remittance_batches'
--      );
--    -- Expected: is_nullable = 'NO' for all rows
