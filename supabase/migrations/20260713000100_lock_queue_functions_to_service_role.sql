-- =========================================================
-- Security hardening: queue worker function permissions
-- =========================================================
-- Queue-management functions use SECURITY DEFINER and may
-- bypass ordinary row-level security boundaries.
--
-- Only trusted backend workers using the service_role key
-- may execute these functions.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- claim_next_queue_job(text)
-- ---------------------------------------------------------

REVOKE ALL
ON FUNCTION public.claim_next_queue_job(text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.claim_next_queue_job(text)
FROM anon;

REVOKE ALL
ON FUNCTION public.claim_next_queue_job(text)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_next_queue_job(text)
TO service_role;


-- ---------------------------------------------------------
-- recover_stalled_queue_jobs(integer)
-- ---------------------------------------------------------

REVOKE ALL
ON FUNCTION public.recover_stalled_queue_jobs(integer)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.recover_stalled_queue_jobs(integer)
FROM anon;

REVOKE ALL
ON FUNCTION public.recover_stalled_queue_jobs(integer)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.recover_stalled_queue_jobs(integer)
TO service_role;

COMMIT;