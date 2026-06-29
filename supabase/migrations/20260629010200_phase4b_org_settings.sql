-- =========================================================
-- Phase 4B — Priority 3: Org Settings
-- =========================================================
-- Stores clinic-level configuration: identity, operational
-- defaults, and security posture flags.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.org_settings (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid        NOT NULL UNIQUE REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  -- Clinic identity
  clinic_name      text,
  address          text,
  phone            text,
  npi              text,
  tax_id           text,
  -- Operational
  timezone         text        NOT NULL DEFAULT 'America/New_York',
  default_sla_days integer     NOT NULL DEFAULT 30 CHECK (default_sla_days > 0),
  -- Security posture
  mfa_required     boolean     NOT NULL DEFAULT false,
  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON public.org_settings (org_id);

-- Auto-update updated_at.
CREATE OR REPLACE FUNCTION public.org_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_org_settings_updated_at ON public.org_settings;
CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.org_settings_updated_at();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'org_settings'
      AND policyname = 'org_settings_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY org_settings_select ON public.org_settings
        FOR SELECT TO authenticated
        USING (public.is_org_member(org_id, auth.uid()))
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'org_settings'
      AND policyname = 'org_settings_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY org_settings_insert ON public.org_settings
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner'])
        )
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'org_settings'
      AND policyname = 'org_settings_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY org_settings_update ON public.org_settings
        FOR UPDATE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner']))
        WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner']))
    $p$;
  END IF;
END $$;

GRANT ALL ON public.org_settings TO authenticated;
