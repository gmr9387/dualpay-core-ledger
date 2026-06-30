-- ────────────────────────────────────────────────────────────────────────────
-- Phase 5A — Financial State Normalization: Backfill
--
-- Depends on: 20260630000100_phase5a_financial_state_schema.sql
--
-- Populates claims.financial_state from payload→intel→reimbursement_state
-- using a deterministic mapping, and recovery_outcomes.financial_state
-- from resolution_type.
--
-- Mapping (claims):
--   paid            → recovered_full
--   written_off     → written_off
--   denied          → in_appeal  (when active appeal exists in payload)
--                  → denied      (otherwise)
--   appealing       → in_appeal
--   partially_paid  → underpaid          (underpayment_cents > 0)
--                  → recovered_partial   (otherwise)
--   resolved        → closed_no_balance  (underpayment_cents = 0 or null)
--                  → recovered_partial   (underpayment_cents > 0)
--   submitted       → outstanding
--   pending_payer   → outstanding
--   (anything else) → outstanding        (safe default for unknown values)
--
-- Mapping (recovery_outcomes):
--   recovered_full        → recovered_full
--   recovered_partial     → recovered_partial
--   appeal_won            → recovered_full
--   appeal_lost           → written_off
--   corrected_and_paid    → recovered_full
--   resubmitted_and_paid  → recovered_full
--   written_off           → written_off
--   patient_responsibility→ written_off
--   duplicate_closed      → closed_no_balance
--   (anything else)       → written_off  (safe default)
--
-- Rollback (reverts data only; schema columns are dropped by Phase 5A schema
-- rollback):
--   UPDATE public.claims            SET financial_state = NULL;
--   UPDATE public.recovery_outcomes SET financial_state = NULL;
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_rs          TEXT;
  v_underpay    BIGINT;
  v_has_appeal  BOOLEAN;
  v_fs          TEXT;
  rec           RECORD;
  v_claims_done BIGINT := 0;
  v_outcomes_done BIGINT := 0;
BEGIN

  -- ── 1. Backfill claims ────────────────────────────────────────────────────
  --
  -- Reads reimbursement_state from payload->'intel'->>'reimbursement_state'.
  -- For denied claims, checks whether any appeal entry in the payload array
  -- payload->'intel'->'appeals' has status 'submitted' or 'in_review'.
  -- Batches using a cursor to avoid long-held locks on large tables.

  FOR rec IN
    SELECT claim_id, payload
    FROM   public.claims
    WHERE  financial_state IS NULL
    ORDER  BY claim_id        -- deterministic order for reproducibility
  LOOP
    -- Extract reimbursement_state
    v_rs := rec.payload #>> '{intel,reimbursement_state}';

    -- Extract underpayment_cents (may be null for non-partial claims)
    v_underpay := (rec.payload #>> '{intel,underpayment_cents}')::BIGINT;

    -- Derive financial_state
    v_fs := CASE v_rs
      WHEN 'paid'          THEN 'recovered_full'
      WHEN 'written_off'   THEN 'written_off'
      WHEN 'appealing'     THEN 'in_appeal'
      WHEN 'partially_paid' THEN
        CASE WHEN COALESCE(v_underpay, 0) > 0
             THEN 'underpaid'
             ELSE 'recovered_partial'
        END
      WHEN 'resolved' THEN
        CASE WHEN COALESCE(v_underpay, 0) > 0
             THEN 'recovered_partial'
             ELSE 'closed_no_balance'
        END
      WHEN 'denied' THEN
        -- Check for an active (submitted or in_review) appeal in the payload
        -- appeals array.  Use EXISTS over a jsonb_array_elements expansion.
        NULL   -- computed below
      WHEN 'submitted'     THEN 'outstanding'
      WHEN 'pending_payer' THEN 'outstanding'
      ELSE 'outstanding'   -- safe default for null / unknown values
    END;

    -- Special handling for 'denied': inspect appeals array
    IF v_rs = 'denied' THEN
      SELECT EXISTS (
        SELECT 1
        FROM   jsonb_array_elements(
                 COALESCE(rec.payload #> '{intel,appeals}', '[]'::jsonb)
               ) AS appeal
        WHERE  (appeal->>'status') IN ('submitted', 'in_review')
      )
      INTO v_has_appeal;

      v_fs := CASE WHEN v_has_appeal THEN 'in_appeal' ELSE 'denied' END;
    END IF;

    UPDATE public.claims
    SET    financial_state = v_fs
    WHERE  claim_id = rec.claim_id;

    v_claims_done := v_claims_done + 1;
  END LOOP;

  RAISE NOTICE 'claims backfill complete: % row(s) updated', v_claims_done;

  -- ── 2. Backfill recovery_outcomes ────────────────────────────────────────

  UPDATE public.recovery_outcomes
  SET    financial_state = CASE resolution_type
    WHEN 'recovered_full'        THEN 'recovered_full'
    WHEN 'recovered_partial'     THEN 'recovered_partial'
    WHEN 'appeal_won'            THEN 'recovered_full'
    WHEN 'appeal_lost'           THEN 'written_off'
    WHEN 'corrected_and_paid'    THEN 'recovered_full'
    WHEN 'resubmitted_and_paid'  THEN 'recovered_full'
    WHEN 'written_off'           THEN 'written_off'
    WHEN 'patient_responsibility'THEN 'written_off'
    WHEN 'duplicate_closed'      THEN 'closed_no_balance'
    ELSE                              'written_off'   -- safe default
  END
  WHERE financial_state IS NULL;

  GET DIAGNOSTICS v_outcomes_done = ROW_COUNT;
  RAISE NOTICE 'recovery_outcomes backfill complete: % row(s) updated', v_outcomes_done;

END $$;


-- ── 3. Validation Report ─────────────────────────────────────────────────────
--
-- These queries are intentionally left as runnable SELECT statements so that
-- operators can re-run them at any time to inspect the current state of the
-- backfill.  They are executed here at migration time to produce output in the
-- migration log.
--
-- Report 1: count by financial_state (claims)
DO $$
DECLARE rec RECORD;
BEGIN
  RAISE NOTICE '=== REPORT 1: claims — count by financial_state ===';
  FOR rec IN
    SELECT COALESCE(financial_state, '(null)') AS financial_state,
           COUNT(*) AS cnt
    FROM   public.claims
    GROUP  BY 1
    ORDER  BY cnt DESC
  LOOP
    RAISE NOTICE '  financial_state=%-30s  count=%', rec.financial_state, rec.cnt;
  END LOOP;
END $$;

-- Report 2: null financial_state counts (should be 0 after successful backfill)
DO $$
DECLARE
  v_null_claims   BIGINT;
  v_null_outcomes BIGINT;
BEGIN
  RAISE NOTICE '=== REPORT 2: null financial_state counts ===';
  SELECT COUNT(*) INTO v_null_claims   FROM public.claims           WHERE financial_state IS NULL;
  SELECT COUNT(*) INTO v_null_outcomes FROM public.recovery_outcomes WHERE financial_state IS NULL;
  RAISE NOTICE '  claims.financial_state           NULL count: %', v_null_claims;
  RAISE NOTICE '  recovery_outcomes.financial_state NULL count: %', v_null_outcomes;
  IF v_null_claims > 0 OR v_null_outcomes > 0 THEN
    RAISE WARNING 'Some rows still have NULL financial_state — backfill may be incomplete.';
  END IF;
END $$;

-- Report 3: reimbursement_state → financial_state mapping counts
DO $$
DECLARE rec RECORD;
BEGIN
  RAISE NOTICE '=== REPORT 3: claims — reimbursement_state → financial_state mapping counts ===';
  FOR rec IN
    SELECT COALESCE(payload #>> '{intel,reimbursement_state}', '(null)') AS reimbursement_state,
           COALESCE(financial_state, '(null)')                             AS financial_state,
           COUNT(*) AS cnt
    FROM   public.claims
    GROUP  BY 1, 2
    ORDER  BY 1, 2
  LOOP
    RAISE NOTICE '  %-20s  →  %-25s  count=%',
      rec.reimbursement_state, rec.financial_state, rec.cnt;
  END LOOP;
END $$;

-- Report 4: recovery_outcomes resolution_type → financial_state mapping counts
DO $$
DECLARE rec RECORD;
BEGIN
  RAISE NOTICE '=== REPORT 4: recovery_outcomes — resolution_type → financial_state mapping counts ===';
  FOR rec IN
    SELECT COALESCE(resolution_type, '(null)')    AS resolution_type,
           COALESCE(financial_state, '(null)')     AS financial_state,
           COUNT(*) AS cnt
    FROM   public.recovery_outcomes
    GROUP  BY 1, 2
    ORDER  BY 1, 2
  LOOP
    RAISE NOTICE '  %-30s  →  %-25s  count=%',
      rec.resolution_type, rec.financial_state, rec.cnt;
  END LOOP;
END $$;

-- Report 5: suspicious / ambiguous rows
-- Flags claims where:
--   a) financial_state still NULL  (backfill gap)
--   b) reimbursement_state = 'denied' AND financial_state = 'in_appeal'
--      but no appeal entries exist  (should not occur given the logic above,
--      but catches any data anomaly)
--   c) reimbursement_state = 'partially_paid' AND underpayment_cents = 0
--      AND financial_state = 'underpaid'  (contradicts mapping)
--   d) financial_state maps to a value not in the canonical set
DO $$
DECLARE
  rec            RECORD;
  v_suspicious   BIGINT := 0;
  v_bad_enum     BIGINT := 0;
BEGIN
  RAISE NOTICE '=== REPORT 5: suspicious / ambiguous claims rows ===';

  -- 5a: still-NULL (should be zero)
  FOR rec IN
    SELECT claim_id, payload #>> '{intel,reimbursement_state}' AS rs
    FROM   public.claims
    WHERE  financial_state IS NULL
    LIMIT  20
  LOOP
    RAISE WARNING '  [NULL fs] claim_id=% reimbursement_state=%', rec.claim_id, rec.rs;
    v_suspicious := v_suspicious + 1;
  END LOOP;

  -- 5b: denied mapped to in_appeal but appeals array is empty / absent
  FOR rec IN
    SELECT claim_id
    FROM   public.claims
    WHERE  financial_state = 'in_appeal'
      AND  payload #>> '{intel,reimbursement_state}' = 'denied'
      AND  NOT EXISTS (
             SELECT 1
             FROM   jsonb_array_elements(
                      COALESCE(payload #> '{intel,appeals}', '[]'::jsonb)
                    ) AS a
             WHERE  (a->>'status') IN ('submitted','in_review')
           )
    LIMIT 20
  LOOP
    RAISE WARNING '  [denied→in_appeal but no active appeal] claim_id=%', rec.claim_id;
    v_suspicious := v_suspicious + 1;
  END LOOP;

  -- 5c: partially_paid with underpayment_cents=0 mapped to underpaid
  FOR rec IN
    SELECT claim_id,
           (payload #>> '{intel,underpayment_cents}')::BIGINT AS underpay
    FROM   public.claims
    WHERE  financial_state = 'underpaid'
      AND  payload #>> '{intel,reimbursement_state}' = 'partially_paid'
      AND  COALESCE((payload #>> '{intel,underpayment_cents}')::BIGINT, 0) = 0
    LIMIT  20
  LOOP
    RAISE WARNING '  [partially_paid underpayment=0 but fs=underpaid] claim_id=% underpay=%',
      rec.claim_id, rec.underpay;
    v_suspicious := v_suspicious + 1;
  END LOOP;

  -- 5d: financial_state value outside canonical set
  SELECT COUNT(*) INTO v_bad_enum
  FROM   public.claims
  WHERE  financial_state IS NOT NULL
    AND  financial_state NOT IN (
           'outstanding','denied','in_appeal','underpaid',
           'recovered_full','recovered_partial','written_off','closed_no_balance'
         );
  IF v_bad_enum > 0 THEN
    RAISE WARNING '  [non-canonical financial_state] % claim row(s) have unrecognised values', v_bad_enum;
    v_suspicious := v_suspicious + v_bad_enum;
  END IF;

  -- recovery_outcomes: check for non-canonical values
  SELECT COUNT(*) INTO v_bad_enum
  FROM   public.recovery_outcomes
  WHERE  financial_state IS NOT NULL
    AND  financial_state NOT IN (
           'outstanding','denied','in_appeal','underpaid',
           'recovered_full','recovered_partial','written_off','closed_no_balance'
         );
  IF v_bad_enum > 0 THEN
    RAISE WARNING '  [non-canonical financial_state] % recovery_outcome row(s) have unrecognised values',
      v_bad_enum;
    v_suspicious := v_suspicious + v_bad_enum;
  END IF;

  IF v_suspicious = 0 THEN
    RAISE NOTICE '  No suspicious rows detected.';
  ELSE
    RAISE NOTICE '  Total suspicious flags: %', v_suspicious;
  END IF;
END $$;
