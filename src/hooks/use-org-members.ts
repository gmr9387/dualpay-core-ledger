/**
 * useOrgMembers — Phase 4B
 *
 * Returns the live member roster for the current organization.
 * Display names are resolved from user_profiles (primary source).
 * Falls back to ops_events actor enrichment, then role-prefixed
 * user_id slice when no other identity is found.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';

export interface OrgMember {
  user_id: string;
  role: string;
  /** Human-readable label for assignment dropdowns and team tables. */
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
}

export function useOrgMembers() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? null;

  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgId],
    queryFn: async (): Promise<OrgMember[]> => {
      if (!orgId) return [];

      // 1. Fetch members from the org roster.
      const { data: members, error: membErr } = await supabase
        .from('organization_members')
        .select('user_id, role')
        .eq('org_id', orgId);

      if (membErr) {
        console.error('[use-org-members] roster load failed', membErr.message);
        return [];
      }

      const rows = members ?? [];
      if (rows.length === 0) return [];

      const userIds = rows.map(r => r.user_id).filter(Boolean) as string[];

      // 2. PRIMARY: load user_profiles for display names.
      const profileMap: Record<string, { display_name: string | null; first_name: string | null; last_name: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, first_name, last_name, display_name')
          .eq('org_id', orgId)
          .in('user_id', userIds);

        for (const p of profiles ?? []) {
          if (p.user_id) profileMap[p.user_id] = { display_name: p.display_name, first_name: p.first_name, last_name: p.last_name };
        }
      }

      // 3. FALLBACK: enrich from ops_events actor identity for users without profiles.
      const missingIds = userIds.filter(id => !profileMap[id]);
      const emailMap: Record<string, string> = {};
      if (missingIds.length > 0) {
        const { data: actorRows } = await supabase
          .from('ops_events')
          .select('actor_user_id, actor_email, actor_name')
          .eq('org_id', orgId)
          .in('actor_user_id', missingIds)
          .not('actor_email', 'is', null)
          .order('occurred_at', { ascending: false })
          .limit(200);

        for (const row of actorRows ?? []) {
          if (row.actor_user_id && !emailMap[row.actor_user_id]) {
            emailMap[row.actor_user_id] =
              row.actor_name || row.actor_email || row.actor_user_id;
          }
        }
      }

      return rows.map(r => {
        const profile = profileMap[r.user_id];
        let display_name: string;
        if (profile) {
          display_name =
            profile.display_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
            emailMap[r.user_id] ||
            `${capitalize(r.role)} (${r.user_id.slice(0, 8)})`;
        } else {
          display_name =
            emailMap[r.user_id] ??
            `${capitalize(r.role)} (${r.user_id.slice(0, 8)})`;
        }
        return {
          user_id: r.user_id,
          role: r.role,
          display_name,
          first_name: profile?.first_name ?? null,
          last_name: profile?.last_name ?? null,
        };
      });
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

