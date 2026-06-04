
CREATE TABLE public.evidence_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  claim_id text,
  denial_id text,
  storage_bucket text NOT NULL DEFAULT 'evidence-documents',
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  document_type text NOT NULL DEFAULT 'Other',
  version integer NOT NULL DEFAULT 1,
  parent_document_id uuid REFERENCES public.evidence_documents(document_id) ON DELETE SET NULL,
  uploaded_by uuid,
  uploaded_by_email text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_documents_org ON public.evidence_documents(org_id);
CREATE INDEX idx_evidence_documents_claim ON public.evidence_documents(claim_id);
CREATE INDEX idx_evidence_documents_denial ON public.evidence_documents(denial_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_documents TO authenticated;
GRANT ALL ON public.evidence_documents TO service_role;

ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_evidence_documents_org_default
BEFORE INSERT ON public.evidence_documents
FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE TRIGGER trg_evidence_documents_updated_at
BEFORE UPDATE ON public.evidence_documents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "evidence_documents_select" ON public.evidence_documents
FOR SELECT TO authenticated
USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));

CREATE POLICY "evidence_documents_insert" ON public.evidence_documents
FOR INSERT TO authenticated
WITH CHECK (
  org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst'])
);

CREATE POLICY "evidence_documents_update" ON public.evidence_documents
FOR UPDATE TO authenticated
USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']))
WITH CHECK (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));

CREATE POLICY "evidence_documents_delete" ON public.evidence_documents
FOR DELETE TO authenticated
USING (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

-- Storage RLS for the two buckets. Path convention: <org_id>/<claim_id?>/<uuid>_<filename>
CREATE POLICY "evidence_storage_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('evidence-documents','appeal-packets')
  AND (
    (storage.foldername(name))[1] IS NULL
    OR public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

CREATE POLICY "evidence_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('evidence-documents','appeal-packets')
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','manager','analyst'])
);

CREATE POLICY "evidence_storage_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id IN ('evidence-documents','appeal-packets')
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','manager','analyst'])
);

CREATE POLICY "evidence_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id IN ('evidence-documents','appeal-packets')
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','manager'])
);
