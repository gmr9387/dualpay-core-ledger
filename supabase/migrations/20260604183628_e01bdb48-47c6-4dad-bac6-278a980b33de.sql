CREATE TABLE public.remittance_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  file_name text not null,
  payer_name text,
  record_count integer not null default 0,
  denial_count integer not null default 0,
  underpayment_count integer not null default 0,
  cob_count integer not null default 0,
  total_billed_cents bigint not null default 0,
  total_paid_cents bigint not null default 0,
  total_adjustment_cents bigint not null default 0,
  expected_recovery_cents bigint not null default 0,
  imported_by text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_batches TO anon;
GRANT ALL ON public.remittance_batches TO service_role;

ALTER TABLE public.remittance_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remittance_batches read" ON public.remittance_batches FOR SELECT USING (true);
CREATE POLICY "remittance_batches insert" ON public.remittance_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "remittance_batches update" ON public.remittance_batches FOR UPDATE USING (true);
CREATE POLICY "remittance_batches delete" ON public.remittance_batches FOR DELETE USING (true);

CREATE INDEX idx_remittance_batches_uploaded_at ON public.remittance_batches (uploaded_at DESC);
CREATE INDEX idx_remittance_batches_batch_id ON public.remittance_batches (batch_id);

CREATE TRIGGER trg_remittance_batches_updated_at
  BEFORE UPDATE ON public.remittance_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();