/**
 * useOrgSettings — Phase 4B
 *
 * Loads and mutates org-level settings (clinic name, NPI, timezone, etc.)
 * for the current organization.  Writes are audit-logged via ops_events.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { appendOpsEvent } from '@/lib/ops-events';

export interface OrgSettings {
  id: string;
  org_id: string;
  clinic_name: string | null;
  address: string | null;
  phone: string | null;
  npi: string | null;
  tax_id: string | null;
  timezone: string;
  default_sla_days: number;
  mfa_required: boolean;
  created_at: string;
  updated_at: string;
}

export type OrgSettingsUpdate = Partial<Omit<OrgSettings, 'id' | 'org_id' | 'created_at' | 'updated_at'>>;

export function useOrgSettings() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? null;
  const qc = useQueryClient();

  const query = useQuery<OrgSettings | null>({
    queryKey: ['org-settings', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('org_settings')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) { console.error('[org-settings] load failed', error.message); return null; }
      return (data as OrgSettings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (updates: OrgSettingsUpdate) => {
      if (!orgId) throw new Error('No org selected');

      // Upsert (insert if first save, update otherwise).
      const { data, error } = await supabase
        .from('org_settings')
        .upsert({ org_id: orgId, ...updates }, { onConflict: 'org_id' })
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      // Audit log.
      await appendOpsEvent({
        kind: 'org_settings_updated',
        org_id: orgId,
        summary: 'Organization settings updated',
        payload: { changed_fields: Object.keys(updates) },
      });

      return data as OrgSettings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-settings', orgId] });
    },
  });

  return { ...query, save };
}
