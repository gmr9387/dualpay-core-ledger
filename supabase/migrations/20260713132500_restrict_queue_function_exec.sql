-- Restrict queue-admin SECURITY DEFINER function execution to service_role only.
-- Idempotent hardening pass for production safety.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'claim_next_queue_job'
      AND p.pronargs = 1
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.claim_next_queue_job(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.claim_next_queue_job(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.claim_next_queue_job(text) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_next_queue_job(text) TO service_role;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recover_stalled_queue_jobs'
      AND p.pronargs = 1
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.recover_stalled_queue_jobs(integer) TO service_role;
  END IF;
END
$$;
