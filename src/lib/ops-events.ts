import { supabase } from '@/integrations/supabase/client';

export type OpsEventKind =
  | 'assignment_changed'
  | 'escalation_raised'
  | 'escalation_resolved'
  | 'sla_acknowledged'
  | 'payer_followup_logged'
  | 'workflow_transition';

export interface OpsEvent {
  event_id: string;
  occurred_at: string;
  kind: OpsEventKind;
  claim_id?: string | null;
  actor?: string | null;
  summary: string;
  payload?: Record<string, unknown> | null;
  created_at?: string;
}

function makeEventId(): string {
  return `EV-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Persistent append-only operations event log (Supabase `ops_events`).
 */
export async function getOpsEvents(): Promise<OpsEvent[]> {
  const { data, error } = await supabase
    .from('ops_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('[ops-events] load failed', error.message);
    return [];
  }
  return (data ?? []) as OpsEvent[];
}

export async function getOpsEventsForClaim(claimId: string): Promise<OpsEvent[]> {
  const { data, error } = await supabase
    .from('ops_events')
    .select('*')
    .eq('claim_id', claimId)
    .order('occurred_at', { ascending: false });
  if (error) {
    console.error('[ops-events] load claim events failed', error.message);
    return [];
  }
  return (data ?? []) as OpsEvent[];
}

export async function appendOpsEvent(
  ev: Omit<OpsEvent, 'event_id' | 'occurred_at' | 'created_at'> & { actor?: string | null },
): Promise<OpsEvent | null> {
  const row = {
    event_id: makeEventId(),
    occurred_at: new Date().toISOString(),
    kind: ev.kind,
    claim_id: ev.claim_id ?? null,
    actor: ev.actor ?? 'Current User',
    summary: ev.summary,
    payload: (ev.payload ?? null) as never,
  };

  const { data, error } = await supabase
    .from('ops_events')
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error('[ops-events] append failed', error.message);
    return null;
  }

  window.dispatchEvent(new Event('clarity-ops-events'));
  return data as OpsEvent;
}

/** ops_events is append-only — kept for API compatibility. */
export async function clearOpsEvents(): Promise<void> {
  console.warn('[ops-events] clearOpsEvents is a no-op; table is append-only');
}
