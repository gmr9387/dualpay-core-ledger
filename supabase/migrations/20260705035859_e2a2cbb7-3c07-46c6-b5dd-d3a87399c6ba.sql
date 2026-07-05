-- Invite Flow: allow handle_new_user_org to honor invited_org_id in user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  invited_org uuid;
  invited_role text;
  new_org_id uuid;
BEGIN
  invited_org := NULLIF(NEW.raw_user_meta_data ->> 'invited_org_id', '')::uuid;
  invited_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'invited_role', ''), 'analyst');

  IF invited_org IS NOT NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE org_id = invited_org) THEN
    -- Invited user joins the existing org; do NOT provision a new organization.
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (invited_org, NEW.id, invited_role)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Default path: brand-new signup → new org owned by the user.
  INSERT INTO public.organizations (name) VALUES ('My Organization') RETURNING org_id INTO new_org_id;
  INSERT INTO public.organization_members (org_id, user_id, role) VALUES (new_org_id, NEW.id, 'owner');
  RETURN NEW;
END;
$function$;