ALTER TABLE public.claim_assignments
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS due_date timestamptz NULL;

CREATE INDEX IF NOT EXISTS claim_assignments_assigned_to_user_id_idx ON public.claim_assignments(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS claim_assignments_assigned_at_idx ON public.claim_assignments(assigned_at DESC);
CREATE INDEX IF NOT EXISTS claim_assignments_due_date_idx ON public.claim_assignments(due_date);
CREATE INDEX IF NOT EXISTS claim_assignments_priority_idx ON public.claim_assignments(priority);
CREATE INDEX IF NOT EXISTS claim_assignments_status_priority_idx ON public.claim_assignments(status, priority DESC);