/**
 * useOrgMembers — Phase 4A
 *
 * Returns the live member roster for the current organization.
 * Replaces the hardcoded ASSIGNEES array in TeamOperations,
 * WorkloadManagement, and auto-assignment logic.
 *
 * Display names are resolved by joining organization_members with
 * actor identity captured in ops_events. Falls back to a
 * role-prefixed user_id slice when no prior activity is found.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';

export interface OrgMember {
  user_id: string;
  role: string;
  /** Human-readable label for assignment dropdowns and team tables. */
  display_name: string;
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

      // 2. Enrich with real actor identity captured during event logging.
      //    ops_events stores actor_email / actor_name at the time of each action.
      const emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: actorRows } = await supabase
          .from('ops_events')
          .select('actor_user_id, actor_email, actor_name')
          .eq('org_id', orgId)
          .in('actor_user_id', userIds)
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

      return rows.map(r => ({
        user_id: r.user_id,
        role: r.role,
        display_name:
          emailMap[r.user_id] ??
          `${capitalize(r.role)} (${r.user_id.slice(0, 8)})`,
      }));
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
