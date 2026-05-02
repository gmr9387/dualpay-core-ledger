-- ── Claims ────────────────────────────────────────────────
CREATE TABLE public.claims (
  claim_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  provider_name TEXT,
  service_date_from DATE NOT NULL,
  service_date_to DATE,
  status TEXT NOT NULL,
  total_billed_cents BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_claims_member ON public.claims(member_id);
CREATE INDEX idx_claims_status ON public.claims(status);

-- ── Adjudication runs ────────────────────────────────────
CREATE TABLE public.adjudication_runs (
  run_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  total_plan_paid_cents BIGINT NOT NULL DEFAULT 0,
  total_member_responsibility_cents BIGINT NOT NULL DEFAULT 0,
  is_retro BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_claim ON public.adjudication_runs(claim_id);

-- ── Traces ───────────────────────────────────────────────
CREATE TABLE public.traces (
  trace_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES public.adjudication_runs(run_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_traces_run ON public.traces(run_id);
CREATE INDEX idx_traces_claim ON public.traces(claim_id);

-- ── Cases ────────────────────────────────────────────────
CREATE TABLE public.cases (
  case_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_member ON public.cases(member_id);

-- ── Case ↔ Claim links ───────────────────────────────────
CREATE TABLE public.case_claim_links (
  case_id TEXT NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, claim_id)
);
CREATE INDEX idx_links_claim ON public.case_claim_links(claim_id);

-- ── Case events ──────────────────────────────────────────
CREATE TABLE public.case_events (
  event_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  claim_id TEXT REFERENCES public.claims(claim_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_case ON public.case_events(case_id, occurred_at);

-- ── Member accumulators ──────────────────────────────────
CREATE TABLE public.member_accumulators (
  member_id TEXT NOT NULL,
  plan_year INTEGER NOT NULL,
  individual_deductible_used_cents BIGINT NOT NULL DEFAULT 0,
  individual_oop_used_cents BIGINT NOT NULL DEFAULT 0,
  family_deductible_used_cents BIGINT NOT NULL DEFAULT 0,
  family_oop_used_cents BIGINT NOT NULL DEFAULT 0,
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, plan_year)
);

-- ── updated_at trigger helper ────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_claims_updated  BEFORE UPDATE ON public.claims  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cases_updated   BEFORE UPDATE ON public.cases   FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_acc_updated     BEFORE UPDATE ON public.member_accumulators FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS (demo posture: open; auth/RBAC is the next hardening step) ──
ALTER TABLE public.claims              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjudication_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_claim_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_accumulators ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'claims','adjudication_runs','traces','cases',
    'case_claim_links','case_events','member_accumulators'
  ]) LOOP
    EXECUTE format('CREATE POLICY "demo_read_%1$s"   ON public.%1$I FOR SELECT USING (true);', t);
    EXECUTE format('CREATE POLICY "demo_insert_%1$s" ON public.%1$I FOR INSERT WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "demo_update_%1$s" ON public.%1$I FOR UPDATE USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "demo_delete_%1$s" ON public.%1$I FOR DELETE USING (true);', t);
  END LOOP;
END $$;