-- DualPay production RLS hardening (pilot readiness security closeout)
-- Scope: ops_events, import_batches, field_mappings, remittance_batches
-- Idempotent and safe to rerun.

-- -1) Preflight assumptions required by this migration.
DO $$
DECLARE
  _missing_cols text[];
  _is_org_member regprocedure;
  _is_org_member_returns_boolean boolean;
BEGIN
  SELECT array_agg(format('public.%I.%I', req.table_name, req.column_name) ORDER BY req.table_name)
  INTO _missing_cols
  FROM (VALUES
    ('ops_events', 'org_id'),
    ('import_batches', 'org_id'),
    ('field_mappings', 'org_id'),
    ('remittance_batches', 'org_id')
  ) AS req(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = req.table_name
      AND c.column_name = req.column_name
  );

  IF _missing_cols IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight failed: missing required org_id columns for RLS hardening: %',
      array_to_string(_missing_cols, ', ');
  END IF;

  _is_org_member := to_regprocedure('public.is_org_member(uuid, uuid)');
  IF _is_org_member IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: required function public.is_org_member(uuid, uuid) does not exist';
  END IF;

  SELECT p.prorettype = 'boolean'::regtype
  INTO _is_org_member_returns_boolean
  FROM pg_proc p
  WHERE p.oid = _is_org_member;

  IF coalesce(_is_org_member_returns_boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'Preflight failed: public.is_org_member(uuid, uuid) must return boolean';
  END IF;
END
$$;

-- 0) Snapshot existing policies (audit record before replacement).
CREATE TEMP TABLE IF NOT EXISTS _dualpay_rls_policy_audit AS
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ops_events', 'import_batches', 'field_mappings', 'remittance_batches');

-- 1) Ensure RLS is enabled.
ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_batches ENABLE ROW LEVEL SECURITY;

-- 2) Remove all existing policies for the four scoped tables.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('ops_events', 'import_batches', 'field_mappings', 'remittance_batches')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END
$$;

-- 3) Remove anonymous access and tighten authenticated grants.
REVOKE ALL ON TABLE public.ops_events FROM anon;
REVOKE ALL ON TABLE public.import_batches FROM anon;
REVOKE ALL ON TABLE public.field_mappings FROM anon;
REVOKE ALL ON TABLE public.remittance_batches FROM anon;

REVOKE DELETE ON TABLE public.ops_events FROM authenticated;
REVOKE DELETE ON TABLE public.import_batches FROM authenticated;
REVOKE DELETE ON TABLE public.field_mappings FROM authenticated;
REVOKE DELETE ON TABLE public.remittance_batches FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.ops_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.field_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.remittance_batches TO authenticated;

-- Preserve service-role operational access.
GRANT ALL ON TABLE public.ops_events TO service_role;
GRANT ALL ON TABLE public.import_batches TO service_role;
GRANT ALL ON TABLE public.field_mappings TO service_role;
GRANT ALL ON TABLE public.remittance_batches TO service_role;

-- 4) Create strict organization-member scoped policies.
-- ops_events (append-only: no UPDATE/DELETE policy by design)
CREATE POLICY ops_events_select_org_member
ON public.ops_events
FOR SELECT
TO authenticated
USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY ops_events_insert_org_member
ON public.ops_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_org_member(org_id, auth.uid()));

-- import_batches
CREATE POLICY import_batches_select_org_member
ON public.import_batches
FOR SELECT
TO authenticated
USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY import_batches_insert_org_member
ON public.import_batches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY import_batches_update_org_member
ON public.import_batches
FOR UPDATE
TO authenticated
USING (public.is_org_member(org_id, auth.uid()))
WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- field_mappings
CREATE POLICY field_mappings_select_org_member
ON public.field_mappings
FOR SELECT
TO authenticated
USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY field_mappings_insert_org_member
ON public.field_mappings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY field_mappings_update_org_member
ON public.field_mappings
FOR UPDATE
TO authenticated
USING (public.is_org_member(org_id, auth.uid()))
WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- remittance_batches
CREATE POLICY remittance_batches_select_org_member
ON public.remittance_batches
FOR SELECT
TO authenticated
USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY remittance_batches_insert_org_member
ON public.remittance_batches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY remittance_batches_update_org_member
ON public.remittance_batches
FOR UPDATE
TO authenticated
USING (public.is_org_member(org_id, auth.uid()))
WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- 5) Verification SQL
-- 5a) List all policies on scoped tables.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ops_events', 'import_batches', 'field_mappings', 'remittance_batches')
ORDER BY tablename, policyname;

-- 5b) Flag permissive USING/WITH CHECK clauses.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ops_events', 'import_batches', 'field_mappings', 'remittance_batches')
  AND (
    regexp_replace(lower(coalesce(qual, '')), '\s+', ' ', 'g') = 'true'
    OR regexp_replace(lower(coalesce(with_check, '')), '\s+', ' ', 'g') = 'true'
  )
ORDER BY tablename, policyname;

-- 5c) Flag policies lacking organization-membership checks.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ops_events', 'import_batches', 'field_mappings', 'remittance_batches')
  AND (
    (cmd = 'SELECT' AND coalesce(qual, '') NOT ILIKE '%is_org_member(%')
    OR (cmd = 'INSERT' AND coalesce(with_check, '') NOT ILIKE '%is_org_member(%')
    OR (
      cmd = 'UPDATE'
      AND (
        coalesce(qual, '') NOT ILIKE '%is_org_member(%'
        OR coalesce(with_check, '') NOT ILIKE '%is_org_member(%'
      )
    )
    OR (cmd = 'DELETE' AND coalesce(qual, '') NOT ILIKE '%is_org_member(%')
    OR (
      cmd = 'ALL'
      AND (
        coalesce(qual, '') NOT ILIKE '%is_org_member(%'
        OR coalesce(with_check, '') NOT ILIKE '%is_org_member(%'
      )
    )
  )
ORDER BY tablename, policyname;
