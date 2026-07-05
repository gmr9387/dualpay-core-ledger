/**
 * Claim assignments — persisted in Supabase `claim_assignments`.
 * Keeps the Phase 2 API (getAssignment / getAllAssignments / setAssignment / ASSIGNEES)
 * so consumer pages and hooks don't change shape.
 */
import { supabase } from '@/integrations/supabase/client';

export type WorkingStatus = 'open' | 'in_progress' | 'snoozed' | 'resolved';

export interface Assignment {
  claim_id: string;
  assignee?: string | null;
  status: WorkingStatus;
  updated_at: string;
}

/**
 * Legacy hardcoded assignee list — kept ONLY as a fallback if the
 * organization has no members loaded yet (e.g. anonymous demo mode).
 * All UI now prefers `loadOrgAssignees()` (real users, real UUIDs).
 */
export const ASSIGNEES: string[] = [];

export interface OrgAssignee {
  user_id: string;
  name: string;
  role: string;
}

/**
 * Load real, org-scoped assignees from `organization_members`
 * joined against `auth.users` metadata.  Returns UUIDs and display
 * names — replaces the hardcoded roster.
 */
export async function loadOrgAssignees(orgId: string): Promise<OrgAssignee[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId);
  if (error) { console.error('[assignments] loadOrgAssignees failed', error.message); return []; }
  return (data ?? []).map((m: { user_id: string; role: string }) => ({
    user_id: m.user_id,
    name: m.user_id.slice(0, 8),   // display fallback; UI resolves full name via profiles/session
    role: m.role,
  }));
}

function notify() { window.dispatchEvent(new Event('clarity-assignments')); }

function rowToAssignment(r: { claim_id: string; assignee: string | null; status: string; updated_at: string }): Assignment {
  return {
    claim_id: r.claim_id,
    assignee: r.assignee ?? undefined,
    status: (r.status as WorkingStatus) ?? 'open',
    updated_at: r.updated_at,
  };
}

export async function loadAllAssignments(): Promise<Record<string, Assignment>> {
  const { data, error } = await supabase.from('claim_assignments').select('*');
  if (error) {
    console.error('[assignments] load failed', error.message);
    return {};
  }
  const out: Record<string, Assignment> = {};
  for (const r of (data ?? [])) out[r.claim_id] = rowToAssignment(r as never);
  return out;
}

/** @deprecated synchronous cache only — prefer the hook. */
let cache: Record<string, Assignment> = {};
export function getAllAssignments(): Record<string, Assignment> { return cache; }
export function _setCache(next: Record<string, Assignment>) { cache = next; }
export function getAssignment(claimId: string): Assignment {
  return cache[claimId] ?? { claim_id: claimId, status: 'open', updated_at: '' };
}

export async function setAssignment(claimId: string, patch: Partial<Assignment>): Promise<Assignment | null> {
  const current = cache[claimId];
  const row = {
    claim_id: claimId,
    assignee: patch.assignee !== undefined ? (patch.assignee ?? null) : (current?.assignee ?? null),
    status: (patch.status ?? current?.status ?? 'open') as WorkingStatus,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('claim_assignments')
    .upsert(row as never, { onConflict: 'claim_id' })
    .select('*')
    .single();
  if (error) {
    console.error('[assignments] upsert failed', error.message);
    return null;
  }
  const next = rowToAssignment(data as never);
  cache = { ...cache, [claimId]: next };
  notify();
  return next;
}
