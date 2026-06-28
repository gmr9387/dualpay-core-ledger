
-- Phase 3A — Operational Workflows Foundation
-- Extends claim_assignments for assignment workflow
-- Leverages ops_events for appeal, recovery, and note tracking
-- No new tables — only schema extension

-- =========================================================
-- 1. Extend claim_assignments with workflow columns
-- =========================================================

ALTER TABLE public.claim_assignments
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS due_date timestamptz NULL;

-- Indexes for worklist queries
CREATE INDEX IF NOT EXISTS claim_assignments_assigned_to_user_id_idx 
  ON public.claim_assignments(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS claim_assignments_assigned_at_idx 
  ON public.claim_assignments(assigned_at DESC);
CREATE INDEX IF NOT EXISTS claim_assignments_due_date_idx 
  ON public.claim_assignments(due_date);
CREATE INDEX IF NOT EXISTS claim_assignments_priority_idx 
  ON public.claim_assignments(priority);
CREATE INDEX IF NOT EXISTS claim_assignments_status_priority_idx 
  ON public.claim_assignments(status, priority DESC);

-- =========================================================
-- 2. Document ops_events kinds used by Phase 3A
-- =========================================================
-- ops_events.kind values (append-only, no schema change):
--   'note_added'              — analyst added a note on the claim
--   'assignment_created'      — claim assigned to analyst
--   'assignment_updated'      — assignment priority/due_date changed
--   'assignment_reassigned'   — reassigned to different analyst
--   'appeal_submitted'        — appeal filed with payer
--   'appeal_responded'        — payer responded to appeal
--   'appeal_resolved'         — appeal closed (won/lost/withdrawn)
--   'recovery_recorded'       — recovery transaction logged (payer/patient/adjustment)
--   'claim_written_off'       — claim marked as written off
--
-- ops_events.payload structure (example):
--   {
--     "note": "Additional documentation requested",
--     "previous_status": "open",
--     "new_status": "in_progress",
--     "recovery_type": "payer_payment",
--     "amount_cents": 50000,
--     "recovered_from": "Blue Cross",
--     "appeal_status": "pending_response"
--   }

-- =========================================================
-- 3. Update claim_assignments demo policies for new columns
-- =========================================================
-- NOTE: Phase 14 migration hardened RLS policies globally.
-- These demo policies will be replaced by Phase 14.
-- For dev/demo mode only:

DROP POLICY IF EXISTS claim_assignments_update_demo ON public.claim_assignments;
CREATE POLICY claim_assignments_update_demo ON public.claim_assignments
  FOR UPDATE USING (true) WITH CHECK (true);
