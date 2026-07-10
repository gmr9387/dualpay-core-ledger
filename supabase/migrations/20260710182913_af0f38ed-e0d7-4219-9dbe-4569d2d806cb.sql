
-- 1. organization_members: restrict self-insert to first-member bootstrap only.
DROP POLICY IF EXISTS members_insert_self_first_or_admin ON public.organization_members;

CREATE POLICY members_insert_bootstrap_or_admin
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- Admin/owner of the org can add any member.
  public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin'])
  OR (
    -- Self-insert only for the very first member (bootstrap the org owner).
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m WHERE m.org_id = organization_members.org_id
    )
  )
);

-- 2. Evidence storage: remove the (foldername IS NULL) branch from SELECT,
--    and tighten INSERT/UPDATE to require an org_id prefix (already true; kept explicit).
DROP POLICY IF EXISTS evidence_storage_select ON storage.objects;

CREATE POLICY evidence_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = ANY (ARRAY['evidence-documents','appeal-packets'])
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
