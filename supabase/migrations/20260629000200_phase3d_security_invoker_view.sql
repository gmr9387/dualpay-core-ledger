-- =========================================================
-- Phase 3D — B-2: Fix v_appeal_pending_counts cross-org leak
-- =========================================================
-- PROBLEM (from Phase 3C audit):
--   The view was created without security_invoker, so it runs under the
--   *owner's* privileges (security definer semantics).  That bypasses the
--   ops_events RLS policies, letting any authenticated user retrieve
--   aggregate counts for ALL organizations by hitting PostgREST directly
--   (e.g. GET /rest/v1/v_appeal_pending_counts).
--
-- FIX:
--   Recreate the view WITH (security_invoker = true).  PostgreSQL will now
--   evaluate all referenced-table RLS policies using the *querying user's*
--   session, so the ops_events SELECT policy
--   (USING public.is_org_member(org_id, auth.uid())) automatically restricts
--   the sub-query to rows the caller is permitted to see.
--
-- The view body is identical to Phase 3C; only the option changes.

DROP VIEW IF EXISTS public.v_appeal_pending_counts;

CREATE VIEW public.v_appeal_pending_counts
  WITH (security_invoker = true)
AS
SELECT
  org_id,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_submitted'
  ) AS pending_count,
  COUNT(*) FILTER (
    WHERE latest_kind IN ('appeal_submitted', 'appeal_responded', 'appeal_resolved')
  ) AS total_count,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_resolved'
      AND latest_payload->>'appeal_status' = 'won'
  ) AS won_count,
  COUNT(*) FILTER (
    WHERE latest_kind = 'appeal_resolved'
      AND latest_payload->>'appeal_status' = 'lost'
  ) AS lost_count
FROM (
  SELECT DISTINCT ON (claim_id, org_id)
    claim_id,
    org_id,
    kind AS latest_kind,
    payload AS latest_payload
  FROM public.ops_events
  WHERE kind IN ('appeal_submitted', 'appeal_responded', 'appeal_resolved')
  ORDER BY claim_id, org_id, occurred_at DESC
) latest_per_claim
GROUP BY org_id;

-- Re-grant SELECT; ownership stays with the creating role.
GRANT SELECT ON public.v_appeal_pending_counts TO authenticated;

COMMENT ON VIEW public.v_appeal_pending_counts IS
  'Appeal pending counts per org. security_invoker=true ensures ops_events RLS '
  'is applied for the querying user — no cross-org data leakage.';
