
-- =========================================================
-- Phase 12 — Identity, Tenancy & RBAC
-- =========================================================

-- ---------- organizations ----------
CREATE TABLE IF NOT EXISTS public.organizations (
  org_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','analyst','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ---------- Helpers (SECURITY DEFINER to avoid RLS recursion) ----------
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id AND user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- ---------- Organization policies ----------
CREATE POLICY "orgs_select_member" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "orgs_insert_any_auth" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "orgs_update_admin" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "orgs_delete_owner" ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner']));

CREATE POLICY "members_select_self_or_member" ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "members_insert_self_first_or_admin" ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()  -- allow self-join on org creation
    OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin'])
  );
CREATE POLICY "members_update_admin" ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "members_delete_admin_or_self" ON public.organization_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));

-- ---------- Auto-create org on new user signup ----------
CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name) VALUES ('My Organization') RETURNING org_id INTO new_org_id;
  INSERT INTO public.organization_members (org_id, user_id, role) VALUES (new_org_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_org();

-- =========================================================
-- Add org_id to all operational tables
-- =========================================================
ALTER TABLE public.claims              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.member_accumulators ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.adjudication_runs   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.cases               ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.case_claim_links    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.case_events         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.traces              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.ops_events          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.claim_assignments   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.recovery_outcomes   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.import_batches      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.import_exceptions   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.field_mappings      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;
ALTER TABLE public.remittance_batches  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE;

-- ops_events actor identity
ALTER TABLE public.ops_events
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_email   text,
  ADD COLUMN IF NOT EXISTS actor_name    text;

-- =========================================================
-- BEFORE INSERT trigger to default org_id from current_org_id()
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_default_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'claims','member_accumulators','adjudication_runs','cases','case_claim_links',
    'case_events','traces','ops_events','claim_assignments','recovery_outcomes',
    'import_batches','import_exceptions','field_mappings','remittance_batches'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id_on_insert ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_org_id_on_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id()', t);
  END LOOP;
END$$;

-- =========================================================
-- Drop all legacy demo policies & create org-scoped policies
-- =========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN (
      'claims','member_accumulators','adjudication_runs','cases','case_claim_links',
      'case_events','traces','ops_events','claim_assignments','recovery_outcomes',
      'import_batches','import_exceptions','field_mappings','remittance_batches'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- Reusable predicate macros via helper functions (inline below as SQL)
-- Roles:
--   read: any member  (or row org_id IS NULL for backward-compat)
--   write claims/ops:  analyst+
--   write imports/cfg: admin+
-- =========================================================

-- ---- generic READ helper inline ----
-- Used in policies: org_id IS NULL OR is_org_member(org_id, auth.uid())

-- Group A — operational data (analyst+ writes)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'claims','member_accumulators','adjudication_runs','cases','case_claim_links',
    'case_events','traces','claim_assignments','recovery_outcomes'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT TO authenticated
        USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
      CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL AND (
            org_id IS NULL
            OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
          )
        );
      CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE TO authenticated
        USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']))
        WITH CHECK (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
      CREATE POLICY "%1$s_delete" ON public.%1$I FOR DELETE TO authenticated
        USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']));
    $f$, t);
  END LOOP;
END$$;

-- Group B — ops_events (append-only; analyst+ insert; no update/delete)
CREATE POLICY "ops_events_select" ON public.ops_events FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "ops_events_insert" ON public.ops_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      org_id IS NULL
      OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
    )
  );

-- Group C — import / config tables (admin+ writes)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches','import_exceptions','field_mappings','remittance_batches']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT TO authenticated
        USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
      CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL AND (
            org_id IS NULL
            OR public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner','manager'])
          )
        );
      CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE TO authenticated
        USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner','manager']))
        WITH CHECK (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner','manager']));
      CREATE POLICY "%1$s_delete" ON public.%1$I FOR DELETE TO authenticated
        USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['admin','owner']));
    $f$, t);
  END LOOP;
END$$;

-- ---------- Indexes for org_id ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'claims','member_accumulators','adjudication_runs','cases','case_claim_links',
    'case_events','traces','ops_events','claim_assignments','recovery_outcomes',
    'import_batches','import_exceptions','field_mappings','remittance_batches'
  ] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%1$s_org_id ON public.%1$I(org_id)', t);
  END LOOP;
END$$;

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
