
-- 1) Backfill org_id with a Legacy Demo Organization
DO $$
DECLARE legacy_org uuid;
BEGIN
  SELECT org_id INTO legacy_org FROM public.organizations WHERE name='Legacy Demo Organization' LIMIT 1;
  IF legacy_org IS NULL THEN
    INSERT INTO public.organizations(name) VALUES ('Legacy Demo Organization') RETURNING org_id INTO legacy_org;
  END IF;

  UPDATE public.claims                SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.member_accumulators   SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.adjudication_runs     SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.cases                 SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.case_claim_links      SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.case_events           SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.traces                SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.ops_events            SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.claim_assignments     SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.recovery_outcomes     SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.import_batches        SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.import_exceptions     SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.field_mappings        SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.remittance_batches    SET org_id = legacy_org WHERE org_id IS NULL;
  UPDATE public.evidence_documents    SET org_id = legacy_org WHERE org_id IS NULL;
END $$;

-- 2) NOT NULL constraints
ALTER TABLE public.claims              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.member_accumulators ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.adjudication_runs   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.cases               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.case_claim_links    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.case_events         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.traces              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.ops_events          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.claim_assignments   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.recovery_outcomes   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.import_batches      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.import_exceptions   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.field_mappings      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.remittance_batches  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.evidence_documents  ALTER COLUMN org_id SET NOT NULL;

-- 3) Harden policies: remove `org_id IS NULL` permissive branch on all operational tables.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'claims','member_accumulators','adjudication_runs','cases','case_claim_links','case_events',
    'traces','ops_events','claim_assignments','recovery_outcomes','import_batches','import_exceptions',
    'field_mappings','remittance_batches','evidence_documents'
  ];
  analyst_roles text := 'ARRAY[''analyst'',''manager'',''admin'',''owner'']';
  manager_roles text := 'ARRAY[''manager'',''admin'',''owner'']';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()))',
      t||'_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND public.has_org_role(org_id, auth.uid(), %s))',
      t||'_insert', t, analyst_roles);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_org_role(org_id, auth.uid(), %s)) WITH CHECK (public.has_org_role(org_id, auth.uid(), %s))',
      t||'_update', t, analyst_roles, analyst_roles);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_org_role(org_id, auth.uid(), %s))',
      t||'_delete', t, manager_roles);
  END LOOP;
END $$;

-- 4) Restrict EXECUTE on internal helpers
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, text[])  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_org_id()                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_default_org_id()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user_org()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at()                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id()                 TO authenticated;
-- set_default_org_id and handle_new_user_org are trigger functions; only the table owner needs EXECUTE.
