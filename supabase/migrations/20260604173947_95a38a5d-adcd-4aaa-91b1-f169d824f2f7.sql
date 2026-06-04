
CREATE TABLE public.import_batches (
  batch_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  record_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  import_score INTEGER NOT NULL DEFAULT 0,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_claim_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_recovery_cents BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  committed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO anon, authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo_read_import_batches" ON public.import_batches FOR SELECT USING (true);
CREATE POLICY "demo_write_import_batches" ON public.import_batches FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_import_batches_updated BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.field_mappings (
  mapping_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_mappings TO anon, authenticated;
GRANT ALL ON public.field_mappings TO service_role;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo_read_field_mappings" ON public.field_mappings FOR SELECT USING (true);
CREATE POLICY "demo_write_field_mappings" ON public.field_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_field_mappings_updated BEFORE UPDATE ON public.field_mappings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_import_batches_status ON public.import_batches(status);
CREATE INDEX idx_import_batches_uploaded_at ON public.import_batches(uploaded_at DESC);
