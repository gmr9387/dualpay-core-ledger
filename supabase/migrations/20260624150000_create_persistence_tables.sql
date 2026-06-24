-- =========================================================
-- Phase 2: Persistence Tables for Replay Store, Ledger, and Idempotency
-- =========================================================
-- 
-- Creates three new tables:
-- 1. replay_records — Cached adjudication snapshots with fingerprints
-- 2. replay_ledger_events — Hash-chained audit events
-- 3. idempotency_keys — Consumed idempotency keys for payment safety
--
-- Tables are org-scoped (org_id) for multi-tenant support.
-- Uniqueness constraints prevent duplicates even on restart.
-- Indexes on frequently-queried columns for performance.
--

-- =========================================================
-- Table: replay_records
-- =========================================================
-- Stores replay snapshots with full adjudication results.
-- Keys to uniqueness constraints on fingerprint and run_id.
--
-- Fingerprint uniqueness ensures:
--   Same input → cached result (idempotency)
--   Prevents duplicate adjudications
--
-- Run ID uniqueness ensures:
--   No collisions on run IDs
--   Prevents replay record conflicts
--

CREATE TABLE IF NOT EXISTS public.replay_records (
  -- Identifiers
  snapshot_id         TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL UNIQUE,
  fingerprint         TEXT NOT NULL UNIQUE,
  
  -- Foreign keys
  claim_id            TEXT NOT NULL,
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  
  -- Payload (full replay record as JSON)
  payload             JSONB NOT NULL,
  
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT replay_records_fingerprint_unique UNIQUE (fingerprint),
  CONSTRAINT replay_records_run_id_unique UNIQUE (run_id),
  CONSTRAINT replay_records_snapshot_id_primary PRIMARY KEY (snapshot_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_replay_records_claim_id 
  ON public.replay_records(claim_id);

CREATE INDEX IF NOT EXISTS idx_replay_records_fingerprint 
  ON public.replay_records(fingerprint);

CREATE INDEX IF NOT EXISTS idx_replay_records_run_id 
  ON public.replay_records(run_id);

CREATE INDEX IF NOT EXISTS idx_replay_records_created_at 
  ON public.replay_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_records_org_id 
  ON public.replay_records(org_id);

-- Row-level security
ALTER TABLE public.replay_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replay_records_select" 
  ON public.replay_records FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));

CREATE POLICY "replay_records_insert" 
  ON public.replay_records FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      org_id IS NULL 
      OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
    )
  );

-- =========================================================
-- Table: replay_ledger_events
-- =========================================================
-- Stores hash-chained audit events for ledger verification.
-- 
-- Event hash chain properties:
--   prev_event_hash links to previous event
--   Tampering detectable via hash verification
--   Append-only (no updates)
--
-- Event types:
--   ADJUDICATION_CREATED — Original adjudication recorded
--   SNAPSHOT_CREATED — Replay snapshot created
--   FINGERPRINT_CREATED — Fingerprint assigned
--   REPLAY_RECORD_SAVED — Record persisted
--   REPLAY_EXECUTED — Replay executed
--   VERIFICATION_PASSED — Hash chain verified
--   VERIFICATION_FAILED — Hash chain broken (alert!)
--

CREATE TABLE IF NOT EXISTS public.replay_ledger_events (
  -- Identifiers
  event_id            TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL,
  
  -- Optional foreign keys to other records
  run_id              TEXT,
  snapshot_id         TEXT,
  
  -- Organization scope
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  
  -- Event metadata
  type                TEXT NOT NULL,
  actor               TEXT NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL,
  
  -- Hash chain (tamper detection)
  prev_event_hash     TEXT NOT NULL,
  event_hash          TEXT NOT NULL,
  
  -- Event payload
  details             JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT replay_ledger_events_id_primary PRIMARY KEY (event_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_claim_id 
  ON public.replay_ledger_events(claim_id);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_event_hash 
  ON public.replay_ledger_events(event_hash);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_prev_hash 
  ON public.replay_ledger_events(prev_event_hash);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_timestamp 
  ON public.replay_ledger_events(timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_type 
  ON public.replay_ledger_events(type);

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_run_id 
  ON public.replay_ledger_events(run_id) WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_snapshot_id 
  ON public.replay_ledger_events(snapshot_id) WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_replay_ledger_events_org_id 
  ON public.replay_ledger_events(org_id);

-- Row-level security
ALTER TABLE public.replay_ledger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replay_ledger_events_select" 
  ON public.replay_ledger_events FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));

CREATE POLICY "replay_ledger_events_insert" 
  ON public.replay_ledger_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      org_id IS NULL 
      OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
    )
  );

-- =========================================================
-- Table: idempotency_keys
-- =========================================================
-- Tracks consumed idempotency keys to prevent duplicate payments.
--
-- Payment safety guarantees:
--   Payment transitions require fresh key
--   Consumed key → payment rejected (even after restart)
--   DB is source of truth (survives restarts)
--
-- Audit trail:
--   actor: system/payment-service/user
--   consumed_at: timestamp of consumption
--

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  -- Identifiers
  key                 TEXT PRIMARY KEY,
  claim_id            TEXT NOT NULL,
  
  -- Organization scope
  org_id              UUID REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  
  -- Audit trail
  actor               TEXT NOT NULL,
  consumed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT idempotency_keys_key_primary PRIMARY KEY (key)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_claim_id 
  ON public.idempotency_keys(claim_id);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_consumed_at 
  ON public.idempotency_keys(consumed_at DESC);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_org_id 
  ON public.idempotency_keys(org_id);

-- Row-level security
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_keys_select" 
  ON public.idempotency_keys FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));

CREATE POLICY "idempotency_keys_insert" 
  ON public.idempotency_keys FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      org_id IS NULL 
      OR public.has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
    )
  );

-- =========================================================
-- Grants (for service role if needed)
-- =========================================================
-- Service role (used by application) needs write access
GRANT SELECT, INSERT ON public.replay_records TO authenticated;
GRANT SELECT, INSERT ON public.replay_ledger_events TO authenticated;
GRANT SELECT, INSERT ON public.idempotency_keys TO authenticated;
