
-- ops_events: append-only operational audit log
CREATE TABLE IF NOT EXISTS public.ops_events (
  event_id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  claim_id text NULL REFERENCES public.claims(claim_id) ON DELETE SET NULL,
  actor text NULL,
  summary text NOT NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_events_occurred_at_idx ON public.ops_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS ops_events_claim_id_idx ON public.ops_events(claim_id);
CREATE INDEX IF NOT EXISTS ops_events_kind_idx ON public.ops_events(kind);

GRANT SELECT, INSERT ON public.ops_events TO anon, authenticated;
GRANT ALL ON public.ops_events TO service_role;

ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_ops_events   ON public.ops_events FOR SELECT USING (true);
CREATE POLICY demo_insert_ops_events ON public.ops_events FOR INSERT WITH CHECK (true);
-- append-only: no UPDATE / DELETE policy

-- claim_assignments
CREATE TABLE IF NOT EXISTS public.claim_assignments (
  claim_id text PRIMARY KEY REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  assignee text NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_assignments_status_chk CHECK (status IN ('open','in_progress','snoozed','resolved'))
);
CREATE INDEX IF NOT EXISTS claim_assignments_assignee_idx ON public.claim_assignments(assignee);
CREATE INDEX IF NOT EXISTS claim_assignments_status_idx ON public.claim_assignments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_assignments TO anon, authenticated;
GRANT ALL ON public.claim_assignments TO service_role;

ALTER TABLE public.claim_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_claim_assignments   ON public.claim_assignments FOR SELECT USING (true);
CREATE POLICY demo_insert_claim_assignments ON public.claim_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_claim_assignments ON public.claim_assignments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_claim_assignments ON public.claim_assignments FOR DELETE USING (true);

CREATE TRIGGER claim_assignments_touch BEFORE UPDATE ON public.claim_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- recovery_outcomes
CREATE TABLE IF NOT EXISTS public.recovery_outcomes (
  outcome_id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  denial_id text NULL,
  payer_id text NULL,
  resolution_type text NOT NULL,
  resolution_date timestamptz NOT NULL,
  denied_amount_cents bigint NOT NULL DEFAULT 0,
  recovered_amount_cents bigint NOT NULL DEFAULT 0,
  unrecovered_amount_cents bigint NOT NULL DEFAULT 0,
  notes text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_outcomes_type_chk CHECK (resolution_type IN (
    'recovered_full','recovered_partial','appeal_won','appeal_lost',
    'corrected_and_paid','resubmitted_and_paid','written_off',
    'patient_responsibility','duplicate_closed'
  ))
);
CREATE INDEX IF NOT EXISTS recovery_outcomes_claim_id_idx ON public.recovery_outcomes(claim_id);
CREATE INDEX IF NOT EXISTS recovery_outcomes_resolution_type_idx ON public.recovery_outcomes(resolution_type);
CREATE INDEX IF NOT EXISTS recovery_outcomes_resolution_date_idx ON public.recovery_outcomes(resolution_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_outcomes TO anon, authenticated;
GRANT ALL ON public.recovery_outcomes TO service_role;

ALTER TABLE public.recovery_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_recovery_outcomes   ON public.recovery_outcomes FOR SELECT USING (true);
CREATE POLICY demo_insert_recovery_outcomes ON public.recovery_outcomes FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_recovery_outcomes ON public.recovery_outcomes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_recovery_outcomes ON public.recovery_outcomes FOR DELETE USING (true);

CREATE TRIGGER recovery_outcomes_touch BEFORE UPDATE ON public.recovery_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
