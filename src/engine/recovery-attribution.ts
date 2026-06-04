/**
 * Recovery Attribution Engine — Phase 11
 *
 * Attributes recovered dollars from persisted RecoveryOutcome records
 * to categories, payers, playbooks, owners, resolution actions, and
 * escalation level (derived from claim ops events).  Pure functions —
 * no fabricated data.  When fewer than MIN_SAMPLE outcomes exist for
 * a slice, `insufficient: true` flags the result.
 */
import type { RecoveryOutcome, ResolutionType } from '@/types/outcomes';
import type { DenialCategory, WorkflowOwner } from '@/types/clarity';
import { RECOVERED_RESOLUTIONS } from '@/types/outcomes';

export const MIN_SAMPLE = 5;

export interface AttributionRecord {
  outcome_id: string;
  claim_id: string;
  denial_id?: string;
  category: DenialCategory;
  payer_id: string;
  payer_name: string;
  playbook: DenialCategory;
  workflow_owner: WorkflowOwner;
  resolution_type: ResolutionType;
  recovered_cents: number;
  denied_cents: number;
  days_to_resolution: number;
  was_recovered: boolean;
}

export function attributeOutcomes(outcomes: RecoveryOutcome[]): AttributionRecord[] {
  return outcomes.map(o => ({
    outcome_id: o.outcome_id,
    claim_id: o.claim_id,
    denial_id: o.denial_id,
    category: o.category,
    payer_id: o.payer_id,
    payer_name: o.payer_name,
    playbook: o.playbook_used ?? o.category,
    workflow_owner: o.workflow_owner,
    resolution_type: o.resolution_type,
    recovered_cents: o.recovered_amount_cents,
    denied_cents: o.denied_amount_cents,
    days_to_resolution: o.days_to_resolution,
    was_recovered: RECOVERED_RESOLUTIONS.includes(o.resolution_type),
  }));
}

export interface AttributionSlice {
  key: string;
  label: string;
  count: number;
  recovered_cents: number;
  denied_cents: number;
  recovery_rate: number;
  insufficient: boolean;
}

function slice<K extends keyof AttributionRecord>(
  recs: AttributionRecord[], keyField: K, labelField?: keyof AttributionRecord,
): AttributionSlice[] {
  const m = new Map<string, AttributionRecord[]>();
  for (const r of recs) {
    const k = String(r[keyField]);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()].map(([k, arr]) => {
    const denied = arr.reduce((s, r) => s + r.denied_cents, 0);
    const recovered = arr.reduce((s, r) => s + r.recovered_cents, 0);
    return {
      key: k,
      label: labelField ? String(arr[0][labelField]) : k,
      count: arr.length,
      recovered_cents: recovered,
      denied_cents: denied,
      recovery_rate: denied ? recovered / denied : 0,
      insufficient: arr.length < MIN_SAMPLE,
    };
  }).sort((a, b) => b.recovered_cents - a.recovered_cents);
}

export const byCategory       = (r: AttributionRecord[]) => slice(r, 'category');
export const byPayer          = (r: AttributionRecord[]) => slice(r, 'payer_id', 'payer_name');
export const byPlaybook       = (r: AttributionRecord[]) => slice(r, 'playbook');
export const byOwner          = (r: AttributionRecord[]) => slice(r, 'workflow_owner');
export const byResolutionType = (r: AttributionRecord[]) => slice(r, 'resolution_type');
