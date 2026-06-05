
CREATE TABLE public.edi_transactions (
  transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  transaction_type text NOT NULL,
  file_name text NOT NULL,
  sender_id text,
  receiver_id text,
  interchange_control_number text,
  functional_group_number text,
  transaction_set_number text,
  status text NOT NULL DEFAULT 'received',
  validation_status text NOT NULL DEFAULT 'pending',
  segment_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  raw_content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edi_transactions TO authenticated;
GRANT ALL ON public.edi_transactions TO service_role;
ALTER TABLE public.edi_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edi_tx_org_select" ON public.edi_transactions FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_tx_org_insert" ON public.edi_transactions FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_tx_org_update" ON public.edi_transactions FOR UPDATE TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_tx_org_delete" ON public.edi_transactions FOR DELETE TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER edi_tx_org_default BEFORE INSERT ON public.edi_transactions FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER edi_tx_touch BEFORE UPDATE ON public.edi_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX edi_tx_org_idx ON public.edi_transactions(org_id, received_at DESC);


CREATE TABLE public.edi_segments (
  segment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.edi_transactions(transaction_id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  segment_type text NOT NULL,
  sequence_number integer NOT NULL,
  raw_segment text NOT NULL,
  parsed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edi_segments TO authenticated;
GRANT ALL ON public.edi_segments TO service_role;
ALTER TABLE public.edi_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edi_seg_org_select" ON public.edi_segments FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_seg_org_insert" ON public.edi_segments FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_seg_org_update" ON public.edi_segments FOR UPDATE TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_seg_org_delete" ON public.edi_segments FOR DELETE TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER edi_seg_org_default BEFORE INSERT ON public.edi_segments FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX edi_seg_tx_idx ON public.edi_segments(transaction_id, sequence_number);


CREATE TABLE public.edi_errors (
  error_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.edi_transactions(transaction_id) ON DELETE CASCADE,
  segment_id uuid REFERENCES public.edi_segments(segment_id) ON DELETE SET NULL,
  org_id uuid NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  error_code text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edi_errors TO authenticated;
GRANT ALL ON public.edi_errors TO service_role;
ALTER TABLE public.edi_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edi_err_org_select" ON public.edi_errors FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_err_org_insert" ON public.edi_errors FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_err_org_update" ON public.edi_errors FOR UPDATE TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "edi_err_org_delete" ON public.edi_errors FOR DELETE TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER edi_err_org_default BEFORE INSERT ON public.edi_errors FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX edi_err_tx_idx ON public.edi_errors(transaction_id, created_at DESC);
