-- =========================================================
-- Fix handle_new_user_org — skip org bootstrap for invited users
--
-- When a user signs up from an invitation their raw_user_meta_data
-- contains invited_org_id (and optionally invited_role).  In that
-- case we must NOT create a new "My Organization"; instead we insert
-- an organization_members row for the invited org and return early.
--
-- For all other signups the existing owner-bootstrap behaviour is
-- preserved unchanged.
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invited_org_id uuid;
  v_invited_role    text;
  v_new_org_id      uuid;
BEGIN
  -- Read optional invite metadata set by the client during signUp().
  BEGIN
    v_invited_org_id := (NEW.raw_user_meta_data->>'invited_org_id')::uuid;
  EXCEPTION WHEN others THEN
    v_invited_org_id := NULL;
  END;

  IF v_invited_org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.organizations WHERE org_id = v_invited_org_id) THEN
    -- Invited user path: join the existing org; do NOT create "My Organization".
    v_invited_role := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'invited_role'), ''),
      'analyst'
    );
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_invited_org_id, NEW.id, v_invited_role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
  ELSE
    -- Regular signup path: provision a brand-new org as before.
    INSERT INTO public.organizations (name)
    VALUES ('My Organization')
    RETURNING org_id INTO v_new_org_id;
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_new_org_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger (on_auth_user_created_org) was created in migration
-- 20260604200310 and already points to this function; no need to
-- recreate it.
