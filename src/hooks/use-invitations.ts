/**
 * useInvitations — Phase 4B
 *
 * Loads, creates, and revokes org member invitations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { useAuth } from '@/hooks/use-auth';

export interface Invitation {
  invite_id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export function useInvitations() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.org_id ?? null;
  const qc = useQueryClient();

  const query = useQuery<Invitation[]>({
    queryKey: ['invitations', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) { console.error('[invitations] load failed', error.message); return []; }
      return (data ?? []) as Invitation[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!orgId || !user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('invitations')
        .insert({ org_id: orgId, email, role, created_by: user.id })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as Invitation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', orgId] }),
  });

  const revoke = useMutation({
    mutationFn: async (invite_id: string) => {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('invite_id', invite_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', orgId] }),
  });

  return { ...query, create, revoke };
}

/** Loads a single invitation by token (unauthenticated-safe read). */
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) { console.error('[invitations] token lookup failed', error.message); return null; }
  return (data as Invitation) ?? null;
}

/** Accept an invitation — creates org membership + user profile. */
export async function acceptInvitation(token: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const invite = await getInvitationByToken(token);
  if (!invite) return { ok: false, error: 'Invitation not found.' };
  if (invite.status !== 'pending') return { ok: false, error: `Invitation is ${invite.status}.` };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: 'Invitation has expired.' };

  // Upsert organization membership.
  const { error: memErr } = await supabase
    .from('organization_members')
    .upsert(
      { org_id: invite.org_id, user_id: userId, role: invite.role },
      { onConflict: 'org_id,user_id' },
    );
  if (memErr) return { ok: false, error: memErr.message };

  // Create user profile placeholder (user can fill out name later).
  await supabase
    .from('user_profiles')
    .upsert(
      { org_id: invite.org_id, user_id: userId, role: invite.role },
      { onConflict: 'user_id,org_id' },
    );

  // Mark invite accepted.
  const { error: updErr } = await supabase
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('invite_id', invite.invite_id);
  if (updErr) console.warn('[invitations] mark accepted failed', updErr.message);

  return { ok: true };
}
