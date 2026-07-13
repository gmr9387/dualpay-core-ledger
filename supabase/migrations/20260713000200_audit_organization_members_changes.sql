-- =========================================================
-- Audit organization membership changes
-- =========================================================
-- Records inserts, role changes, and removals directly from
-- the database so membership activity cannot bypass the
-- application audit path.
-- =========================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_organization_members_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_org_id uuid;
  audit_user_id uuid;
  audit_kind text;
  audit_summary text;
  audit_payload jsonb;
BEGIN
  audit_org_id := COALESCE(NEW.org_id, OLD.org_id);
  audit_user_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    audit_kind := 'organization_member_added';
    audit_summary := 'Organization member added';

    audit_payload := jsonb_build_object(
      'operation', TG_OP,
      'member_user_id', NEW.user_id,
      'new_role', NEW.role
    );

  ELSIF TG_OP = 'UPDATE' THEN
    audit_kind := 'organization_member_updated';
    audit_summary := 'Organization member role updated';

    audit_payload := jsonb_build_object(
      'operation', TG_OP,
      'member_user_id', NEW.user_id,
      'previous_role', OLD.role,
      'new_role', NEW.role
    );

  ELSIF TG_OP = 'DELETE' THEN
    audit_kind := 'organization_member_removed';
    audit_summary := 'Organization member removed';

    audit_payload := jsonb_build_object(
      'operation', TG_OP,
      'member_user_id', OLD.user_id,
      'previous_role', OLD.role
    );
  END IF;

  INSERT INTO public.ops_events (
    event_id,
    occurred_at,
    kind,
    actor,
    actor_user_id,
    summary,
    payload,
    org_id
  )
  VALUES (
    gen_random_uuid()::text,
    now(),
    audit_kind,
    COALESCE(audit_user_id::text, 'system'),
    audit_user_id,
    audit_summary,
    audit_payload,
    audit_org_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL
ON FUNCTION public.audit_organization_members_change()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.audit_organization_members_change()
FROM anon;

REVOKE ALL
ON FUNCTION public.audit_organization_members_change()
FROM authenticated;

DROP TRIGGER IF EXISTS audit_organization_members_change
ON public.organization_members;

CREATE TRIGGER audit_organization_members_change
AFTER INSERT OR UPDATE OR DELETE
ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.audit_organization_members_change();

COMMIT;