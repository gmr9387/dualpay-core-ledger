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
 * @deprecated ASSIGNEES is a Phase 2 hardcoded roster and is no longer used
 * by any UI component as of Phase 4A. The background job-runner uses this
 * as a fallback only; production deployments should replace queue_assignment
 * with an org-scoped query against organization_members.
 */
export const ASSIGNEES = [
  'M. Alvarez (Appeals Lead)',
  'J. Chen (Senior Biller)',
  'R. Okafor (Auth Team)',
  'P. Singh (Clinical Liaison)',
  'D. Nakamura (COB)',
  'K. Brooks (Coding QA)',
];

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
    // H-6: Use (claim_id, org_id) composite conflict key for multi-tenant safety.
    // org_id is set by the DB trigger (set_default_org_id) when not provided.
    .upsert(row as never, { onConflict: 'claim_id,org_id' })
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
