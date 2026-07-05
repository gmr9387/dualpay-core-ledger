/**
 * Current-org resolver — shared by non-React persistence layers
 * (imports, exceptions, workflows) so every insert into a public
 * table carries an explicit org_id and passes RLS for every member.
 *
 * Falls back to the DB `current_org_id()` SECURITY DEFINER function
 * when the caller can't reach React context (e.g. edge triggers,
 * background jobs, or library code).
 */
import { supabase } from '@/integrations/supabase/client';

let cached: string | null = null;

export async function getCurrentOrgId(): Promise<string | null> {
  if (cached) return cached;
  try {
    // 1. UI-selected org (matches what useOrg() shows the user).
    const ls = typeof localStorage !== 'undefined'
      ? localStorage.getItem('clarity:current_org_id')
      : null;
    if (ls) { cached = ls; return ls; }
  } catch { /* noop */ }

  // 2. Server-side truth via SECURITY DEFINER function.
  const { data, error } = await supabase.rpc('current_org_id');
  if (error) { console.warn('[current-org] rpc failed', error.message); return null; }
  const orgId = (data as unknown as string) ?? null;
  cached = orgId;
  return orgId;
}

export function resetCurrentOrgCache() { cached = null; }
