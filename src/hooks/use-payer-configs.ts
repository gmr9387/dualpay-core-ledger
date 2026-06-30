/**
 * usePayerConfigs — Phase 4B
 *
 * Loads and mutates payer configuration for the current org.
 * Includes a helper to seed the BCBSM Michigan template.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { appendOpsEvent } from '@/lib/ops-events';

export interface PayerConfig {
  payer_config_id: string;
  org_id: string;
  payer_name: string;
  payer_id: string | null;
  timely_filing_days: number;
  appeal_deadline_days: number;
  portal_url: string | null;
  documentation_checklist: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PayerConfigInsert = Omit<PayerConfig, 'payer_config_id' | 'org_id' | 'created_at' | 'updated_at'>;

export const BCBSM_TEMPLATE: Omit<PayerConfigInsert, 'documentation_checklist'> & { documentation_checklist: string[] } = {
  payer_name: 'BCBSM Michigan',
  payer_id: 'MIBCBS',
  timely_filing_days: 365,
  appeal_deadline_days: 180,
  portal_url: 'https://ereferrals.bcbsm.com',
  documentation_checklist: [
    'Completed CMS-1500 or UB-04',
    'Itemized billing statement',
    'Medical records supporting necessity',
    'Remittance advice from original claim',
    'Appeal cover letter with policy number',
    'Physician notes for date of service',
    'Prior authorization documentation (if applicable)',
  ],
  notes: 'BCBSM Michigan. Level 1 appeals must be submitted within 180 days of denial. Refer to BCBSM provider portal for portal-based submissions.',
};

export function usePayerConfigs() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? null;
  const qc = useQueryClient();

  const query = useQuery<PayerConfig[]>({
    queryKey: ['payer-configs', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('payer_configs')
        .select('*')
        .eq('org_id', orgId)
        .order('payer_name');
      if (error) { console.error('[payer-configs] load failed', error.message); return []; }
      return (data ?? []).map(r => ({
        ...r,
        documentation_checklist: Array.isArray(r.documentation_checklist) ? r.documentation_checklist as string[] : [],
      }));
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const upsert = useMutation({
    mutationFn: async (cfg: Partial<PayerConfig> & { payer_name: string }) => {
      if (!orgId) throw new Error('No org selected');
      const { payer_config_id, ...rest } = cfg;
      const payload = { org_id: orgId, ...rest, documentation_checklist: cfg.documentation_checklist ?? [] };

      let result;
      if (payer_config_id) {
        const { data, error } = await supabase
          .from('payer_configs')
          .update(payload as never)
          .eq('payer_config_id', payer_config_id)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        result = data;
      } else {
        const { data, error } = await supabase
          .from('payer_configs')
          .upsert(payload as never, { onConflict: 'org_id,payer_name' })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        result = data;
      }

      await appendOpsEvent({
        kind: 'payer_config_updated',
        org_id: orgId,
        summary: `Payer config saved: ${cfg.payer_name}`,
        payload: { payer_name: cfg.payer_name },
      });

      return result as PayerConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payer-configs', orgId] }),
  });

  const remove = useMutation({
    mutationFn: async (payer_config_id: string) => {
      if (!orgId) throw new Error('No org selected');
      const { error } = await supabase
        .from('payer_configs')
        .delete()
        .eq('payer_config_id', payer_config_id)
        .eq('org_id', orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payer-configs', orgId] }),
  });

  const seedBcbsm = useMutation({
    mutationFn: async () => {
      return upsert.mutateAsync({ ...BCBSM_TEMPLATE });
    },
  });

  return { ...query, upsert, remove, seedBcbsm };
}
