-- =========================================================
-- Phase 4B — Priority 1: User Profiles
-- =========================================================
-- Creates user_profiles as the authoritative display-name
-- source for organization members.  ops_events actor
-- enrichment becomes fallback only.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL,
  org_id      uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  first_name  text,
  last_name   text,
  display_name text,
  role        text        NOT NULL DEFAULT 'analyst',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON public.user_profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles (user_id);

-- Trigger: keep updated_at current.
CREATE OR REPLACE FUNCTION public.user_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_updated_at();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Any org member may read all profiles in their org.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY user_profiles_select ON public.user_profiles
        FOR SELECT TO authenticated
        USING (public.is_org_member(org_id, auth.uid()))
    $p$;
  END IF;
END $$;

-- Users can insert their own profile; admins can create on behalf of others.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY user_profiles_insert ON public.user_profiles
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND (
            user_id = auth.uid()
            OR public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner'])
          )
        )
    $p$;
  END IF;
END $$;

-- Users can update their own profile; admins can update any.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY user_profiles_update ON public.user_profiles
        FOR UPDATE TO authenticated
        USING (
          user_id = auth.uid()
          OR public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner'])
        )
        WITH CHECK (
          user_id = auth.uid()
          OR public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner'])
        )
    $p$;
  END IF;
END $$;

-- Only admins/owners can delete profiles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY user_profiles_delete ON public.user_profiles
        FOR DELETE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner']))
    $p$;
  END IF;
END $$;

GRANT ALL ON public.user_profiles TO authenticated;
