-- Phase 7 — Persistent Operations Events
-- Moves Recovery Operations audit events from localStorage to Supabase.

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

CREATE INDEX IF NOT EXISTS idx_ops_events_occurred_at
  ON public.ops_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_events_claim_id
  ON public.ops_events (claim_id);

CREATE INDEX IF NOT EXISTS idx_ops_events_kind
  ON public.ops_events (kind);

ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.ops_events TO authenticated;
GRANT ALL ON public.ops_events TO service_role;

CREATE POLICY ops_events_select_authenticated
  ON public.ops_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY ops_events_insert_authenticated
  ON public.ops_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Append-only protection.
CREATE OR REPLACE FUNCTION public.prevent_ops_events_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ops_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_ops_events_update ON public.ops_events;
CREATE TRIGGER prevent_ops_events_update
BEFORE UPDATE ON public.ops_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_events_update_delete();

DROP TRIGGER IF EXISTS prevent_ops_events_delete ON public.ops_events;
CREATE TRIGGER prevent_ops_events_delete
BEFORE DELETE ON public.ops_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_events_update_delete();