
-- Phase 20 — Remittance Lineage & Batch-to-Claim Traceability

-- 1. remittance_lines: every imported remittance row, persisted independently
CREATE TABLE public.remittance_lines (
  remittance_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  remittance_batch_id uuid,
  import_batch_id uuid,
  source_row_number integer,
  claim_id text,
  payer_name text,
  service_date date,
  procedure_code text,
  modifier text,
  billed_amount_cents bigint NOT NULL DEFAULT 0,
  allowed_amount_cents bigint NOT NULL DEFAULT 0,
  paid_amount_cents bigint NOT NULL DEFAULT 0,
  patient_responsibility_cents bigint NOT NULL DEFAULT 0,
  adjustment_amount_cents bigint NOT NULL DEFAULT 0,
  carc_code text,
  rarc_code text,
  group_code text,
  classification text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_lines TO authenticated;
GRANT ALL ON public.remittance_lines TO service_role;
ALTER TABLE public.remittance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remittance_lines select" ON public.remittance_lines
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "remittance_lines insert" ON public.remittance_lines
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));
CREATE POLICY "remittance_lines update" ON public.remittance_lines
  FOR UPDATE TO authenticated USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));
CREATE POLICY "remittance_lines delete" ON public.remittance_lines
  FOR DELETE TO authenticated USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE TRIGGER trg_remittance_lines_org BEFORE INSERT ON public.remittance_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE INDEX idx_remittance_lines_org ON public.remittance_lines(org_id);
CREATE INDEX idx_remittance_lines_claim ON public.remittance_lines(org_id, claim_id);
CREATE INDEX idx_remittance_lines_batch ON public.remittance_lines(org_id, remittance_batch_id);
CREATE INDEX idx_remittance_lines_import_batch ON public.remittance_lines(org_id, import_batch_id);


-- 2. claim_source_links: trace claim back to its source rows
CREATE TABLE public.claim_source_links (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  source_row_number integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_source_links TO authenticated;
GRANT ALL ON public.claim_source_links TO service_role;
ALTER TABLE public.claim_source_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claim_source_links select" ON public.claim_source_links
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "claim_source_links insert" ON public.claim_source_links
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));
CREATE POLICY "claim_source_links update" ON public.claim_source_links
  FOR UPDATE TO authenticated USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));
CREATE POLICY "claim_source_links delete" ON public.claim_source_links
  FOR DELETE TO authenticated USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager']));

CREATE TRIGGER trg_claim_source_links_org BEFORE INSERT ON public.claim_source_links
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE INDEX idx_claim_source_links_org_claim ON public.claim_source_links(org_id, claim_id);
CREATE INDEX idx_claim_source_links_source ON public.claim_source_links(org_id, source_type, source_id);


-- 3. recovery_lineage_events: append-only lineage timeline
CREATE TABLE public.recovery_lineage_events (
  lineage_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id text,
  remittance_line_id uuid,
  dispute_id uuid,
  outcome_id uuid,
  event_type text NOT NULL,
  event_summary text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.recovery_lineage_events TO authenticated;
GRANT ALL ON public.recovery_lineage_events TO service_role;
ALTER TABLE public.recovery_lineage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recovery_lineage_events select" ON public.recovery_lineage_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "recovery_lineage_events insert" ON public.recovery_lineage_events
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','manager','analyst']));

CREATE TRIGGER trg_lineage_events_org BEFORE INSERT ON public.recovery_lineage_events
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE INDEX idx_lineage_events_org_claim ON public.recovery_lineage_events(org_id, claim_id);
CREATE INDEX idx_lineage_events_line ON public.recovery_lineage_events(org_id, remittance_line_id);
CREATE INDEX idx_lineage_events_dispute ON public.recovery_lineage_events(org_id, dispute_id);


-- 4. underpayment_disputes — add remittance_line_id linkage
ALTER TABLE public.underpayment_disputes
  ADD COLUMN IF NOT EXISTS remittance_line_id uuid,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;
CREATE INDEX IF NOT EXISTS idx_underpayment_disputes_remittance_line
  ON public.underpayment_disputes(org_id, remittance_line_id);
