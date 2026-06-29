-- =========================================================
-- Phase 4B — Priority 2: User Invitations
-- =========================================================
-- Enables managers / admins to invite staff to an org
-- by sending a token-bearing link.  Accepting the invite
-- creates an organization_members row and a user_profile.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.invitations (
  invite_id   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'analyst',
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid
);

CREATE INDEX IF NOT EXISTS idx_invitations_org_id  ON public.invitations (org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token   ON public.invitations (token);
CREATE INDEX IF NOT EXISTS idx_invitations_email   ON public.invitations (email);

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Org managers/admins/owners can view their org's invitations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY invitations_select ON public.invitations
        FOR SELECT TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner']))
    $p$;
  END IF;
END $$;

-- Managers+ can create invitations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY invitations_insert ON public.invitations
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner'])
        )
    $p$;
  END IF;
END $$;

-- Managers+ can revoke (update status) invitations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY invitations_update ON public.invitations
        FOR UPDATE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner']))
        WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['manager', 'admin', 'owner']))
    $p$;
  END IF;
END $$;

-- Admins/owners can delete invitations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND policyname = 'invitations_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY invitations_delete ON public.invitations
        FOR DELETE TO authenticated
        USING (public.has_org_role(org_id, auth.uid(), ARRAY['admin', 'owner']))
    $p$;
  END IF;
END $$;

-- Allow any authenticated user to read an invitation by token
-- (needed for the acceptance flow — the user may not yet be an org member).
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
        USING (true)
    $p$;
  END IF;
END $$;

GRANT ALL ON public.invitations TO authenticated;
