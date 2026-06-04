
-- payer_contracts
CREATE TABLE public.payer_contracts (
  contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payer_name text NOT NULL,
  contract_name text NOT NULL,
  version text NOT NULL DEFAULT '1',
  effective_date date NOT NULL,
  termination_date date,
  contract_type text NOT NULL DEFAULT 'commercial',
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payer_contracts TO authenticated;
GRANT ALL ON public.payer_contracts TO service_role;
ALTER TABLE public.payer_contracts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER payer_contracts_set_org BEFORE INSERT ON public.payer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER payer_contracts_touch BEFORE UPDATE ON public.payer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "contracts_select" ON public.payer_contracts FOR SELECT
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "contracts_insert" ON public.payer_contracts FOR INSERT
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "contracts_update" ON public.payer_contracts FOR UPDATE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "contracts_delete" ON public.payer_contracts FOR DELETE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']));
CREATE INDEX payer_contracts_org_payer_idx ON public.payer_contracts(org_id, payer_name);

-- fee_schedules
CREATE TABLE public.fee_schedules (
  fee_schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.payer_contracts(contract_id) ON DELETE CASCADE,
  procedure_code text NOT NULL,
  modifier text,
  contracted_amount_cents bigint NOT NULL DEFAULT 0,
  reimbursement_method text NOT NULL DEFAULT 'fixed_fee',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_schedules TO authenticated;
GRANT ALL ON public.fee_schedules TO service_role;
ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER fee_schedules_set_org BEFORE INSERT ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER fee_schedules_touch BEFORE UPDATE ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "fees_select" ON public.fee_schedules FOR SELECT
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fees_insert" ON public.fee_schedules FOR INSERT
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "fees_update" ON public.fee_schedules FOR UPDATE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "fees_delete" ON public.fee_schedules FOR DELETE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']));
CREATE INDEX fee_schedules_contract_proc_idx ON public.fee_schedules(contract_id, procedure_code);

-- underpayment_disputes
CREATE TABLE public.underpayment_disputes (
  dispute_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id text NOT NULL,
  contract_id uuid REFERENCES public.payer_contracts(contract_id) ON DELETE SET NULL,
  payer_name text NOT NULL,
  procedure_code text,
  expected_amount_cents bigint NOT NULL DEFAULT 0,
  allowed_amount_cents bigint NOT NULL DEFAULT 0,
  paid_amount_cents bigint NOT NULL DEFAULT 0,
  variance_amount_cents bigint NOT NULL DEFAULT 0,
  variance_percent numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'open',
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.underpayment_disputes TO authenticated;
GRANT ALL ON public.underpayment_disputes TO service_role;
ALTER TABLE public.underpayment_disputes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER underpayment_disputes_set_org BEFORE INSERT ON public.underpayment_disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER underpayment_disputes_touch BEFORE UPDATE ON public.underpayment_disputes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "disputes_select" ON public.underpayment_disputes FOR SELECT
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "disputes_insert" ON public.underpayment_disputes FOR INSERT
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "disputes_update" ON public.underpayment_disputes FOR UPDATE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner']));
CREATE POLICY "disputes_delete" ON public.underpayment_disputes FOR DELETE
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner']));
CREATE INDEX disputes_org_claim_idx ON public.underpayment_disputes(org_id, claim_id);
CREATE INDEX disputes_status_idx ON public.underpayment_disputes(status);
