-- Phase 2: Persistence Tables for Replay Store, Ledger, and Idempotency
-- Applied verbatim from supabase/migrations/20260624150000_create_persistence_tables.sql

CREATE TABLE IF NOT EXISTS public.replay_records (
  snapshot_id         TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL UNIQUE,
  fingerprint         TEXT NOT NULL UNIQUE,
  claim_id            TEXT NOT NULL,
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  payload             JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT replay_records_fingerprint_unique UNIQUE (fingerprint),
  CONSTRAINT replay_records_run_id_unique UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_replay_records_claim_id ON public.replay_records(claim_id);
CREATE INDEX IF NOT EXISTS idx_replay_records_fingerprint ON public.replay_records(fingerprint);
CREATE INDEX IF NOT EXISTS idx_replay_records_run_id ON public.replay_records(run_id);
CREATE INDEX IF NOT EXISTS idx_replay_records_created_at ON public.replay_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_records_org_id ON public.replay_records(org_id);

ALTER TABLE public.replay_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replay_records_select" ON public.replay_records FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "replay_records_insert" ON public.replay_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])));

CREATE TABLE IF NOT EXISTS public.replay_ledger_events (
  event_id            TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL,
  run_id              TEXT,
  snapshot_id         TEXT,
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  actor               TEXT NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,
  prev_event_hash     TEXT NOT NULL,
  event_hash          TEXT NOT NULL,
  details             JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_claim_id ON public.replay_ledger_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_event_hash ON public.replay_ledger_events(event_hash);
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_prev_hash ON public.replay_ledger_events(prev_event_hash);
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_timestamp ON public.replay_ledger_events(timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_type ON public.replay_ledger_events(type);
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_run_id ON public.replay_ledger_events(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_snapshot_id ON public.replay_ledger_events(snapshot_id) WHERE snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_org_id ON public.replay_ledger_events(org_id);

ALTER TABLE public.replay_ledger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replay_ledger_events_select" ON public.replay_ledger_events FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "replay_ledger_events_insert" ON public.replay_ledger_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])));

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key                 TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL,
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  actor               TEXT NOT NULL,
  consumed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_claim_id ON public.idempotency_keys(claim_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_consumed_at ON public.idempotency_keys(consumed_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_org_id ON public.idempotency_keys(org_id);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_keys_select" ON public.idempotency_keys FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "idempotency_keys_insert" ON public.idempotency_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (org_id IS NULL OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])));

GRANT SELECT, INSERT ON public.replay_records TO authenticated;
GRANT SELECT, INSERT ON public.replay_ledger_events TO authenticated;
GRANT SELECT, INSERT ON public.idempotency_keys TO authenticated;
GRANT ALL ON public.replay_records TO service_role;
GRANT ALL ON public.replay_ledger_events TO service_role;
GRANT ALL ON public.idempotency_keys TO service_role;