-- =========================================================
-- Phase 4B — Priority 6: Payer Configurations
-- =========================================================
-- Stores payer-specific rules: timely filing windows,
-- appeal deadlines, portal URL, and documentation
-- checklist.  Admins can configure without engineering.
--
-- BCBSM Michigan is seeded as the first-party template.
-- On the first org that creates a row, they can "load
-- BCBSM defaults" from the application layer (no
-- hardcoded org_id required).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.payer_configs (
  payer_config_id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                   uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  payer_name               text        NOT NULL,
  payer_id                 text,
  timely_filing_days       integer     NOT NULL DEFAULT 365 CHECK (timely_filing_days > 0),
  appeal_deadline_days     integer     NOT NULL DEFAULT 60  CHECK (appeal_deadline_days > 0),
  portal_url               text,
  documentation_checklist  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, payer_name)
);

CREATE INDEX IF NOT EXISTS idx_payer_configs_org_id     ON public.payer_configs (org_id);
CREATE INDEX IF NOT EXISTS idx_payer_configs_payer_name ON public.payer_configs (payer_name);

CREATE OR REPLACE FUNCTION public.payer_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_payer_configs_updated_at ON public.payer_configs;
CREATE TRIGGER trg_payer_configs_updated_at
  BEFORE UPDATE ON public.payer_configs
  FOR EACH ROW EXECUTE FUNCTION public.payer_configs_updated_at();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.payer_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payer_configs'
      AND policyname = 'payer_configs_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY payer_configs_select ON public.payer_configs
        FOR SELECT TO authenticated
        USING (public.is_org_member(org_id, auth.uid()))
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payer_configs'
      AND policyname = 'payer_configs_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY payer_configs_insert ON public.payer_configs
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner'])
        )
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payer_configs'
      AND policyname = 'payer_configs_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY payer_configs_update ON public.payer_configs
        FOR UPDATE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner']))
        WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner']))
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payer_configs'
      AND policyname = 'payer_configs_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY payer_configs_delete ON public.payer_configs
        FOR DELETE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner']))
    $p$;
  END IF;
END $$;

GRANT ALL ON public.payer_configs TO authenticated;
