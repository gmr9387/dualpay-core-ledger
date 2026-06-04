
CREATE TABLE public.import_exceptions (
  exception_id text PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.import_batches(batch_id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  source_row jsonb NOT NULL,
  mapped_row jsonb,
  severity text NOT NULL CHECK (severity IN ('error','warning')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','corrected','ignored','imported')),
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_claim_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_exceptions TO authenticated;
GRANT ALL ON public.import_exceptions TO service_role;

ALTER TABLE public.import_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read exceptions"
  ON public.import_exceptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert exceptions"
  ON public.import_exceptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update exceptions"
  ON public.import_exceptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete exceptions"
  ON public.import_exceptions FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_import_exceptions_batch ON public.import_exceptions(batch_id);
CREATE INDEX idx_import_exceptions_status ON public.import_exceptions(status);
CREATE INDEX idx_import_exceptions_severity ON public.import_exceptions(severity);

CREATE TRIGGER touch_import_exceptions_updated_at
  BEFORE UPDATE ON public.import_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
