-- ────────────────────────────────────────────────────────────────────────────
-- Phase 5A — Financial State Normalization: Schema (additive only)
--
-- Adds financial_state as a nullable TEXT column to:
--   • public.claims
--   • public.recovery_outcomes
--
-- No NOT NULL constraint, no CHECK constraint, no removal of existing columns.
-- Phase 2 (20260630000200) backfills these columns from existing data.
--
-- Rollback:
--   ALTER TABLE public.claims           DROP COLUMN IF EXISTS financial_state;
--   ALTER TABLE public.recovery_outcomes DROP COLUMN IF EXISTS financial_state;
--   DROP INDEX IF EXISTS idx_claims_financial_state;
-- ────────────────────────────────────────────────────────────────────────────

-- ── claims.financial_state ───────────────────────────────────────────────────
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS financial_state TEXT NULL;

COMMENT ON COLUMN public.claims.financial_state IS
  'Normalized financial position of the claim.  Populated by Phase 5A backfill '
  'and kept in sync by the application write layer (Phase 5C).  '
  'Valid values: outstanding, denied, in_appeal, underpaid, recovered_full, '
  'recovered_partial, written_off, closed_no_balance.  '
  'NULL means the claim pre-dates the normalization migration and has not yet '
  'been backfilled.';

CREATE INDEX IF NOT EXISTS idx_claims_financial_state
  ON public.claims (financial_state);

-- ── recovery_outcomes.financial_state ────────────────────────────────────────
ALTER TABLE public.recovery_outcomes
  ADD COLUMN IF NOT EXISTS financial_state TEXT NULL;

COMMENT ON COLUMN public.recovery_outcomes.financial_state IS
  'Normalized financial state derived from resolution_type.  '
  'Valid values mirror claims.financial_state.  '
  'Populated by Phase 5A backfill; resolution_type constraint is unchanged.';

CREATE INDEX IF NOT EXISTS idx_recovery_outcomes_financial_state
  ON public.recovery_outcomes (financial_state);
