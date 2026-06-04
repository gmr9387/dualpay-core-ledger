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
 * Persistent append-only operations event log.
 *
 * Phase 7:
 * - Replaces localStorage-backed ops events.
 * - Persists operational audit events to Supabase `ops_events`.
 * - Keeps the same public function names used by Phase 6 screens.
 */
export async function getOpsEvents(): Promise<OpsEvent[]> {
  const { data, error } = await supabase
    .from('ops_events')
    .select('*')
    .order('occurred_at', { ascending: false });

  if (error) {
    console.error('[ops-events] failed to load', error.message);
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
    console.error('[ops-events] failed to load claim events', error.message);
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
    payload: ev.payload ?? null,
  };

  const { data, error } = await supabase
    .from('ops_events')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    console.error('[ops-events] failed to append', error.message);
    return null;
  }

  window.dispatchEvent(new Event('clarity-ops-events'));
  return data as OpsEvent;
}

/**
 * Append-only means no destructive clear in persistent mode.
 * Kept for compatibility with existing imports/buttons.
 */
export async function clearOpsEvents(): Promise<void> {
  console.warn('[ops-events] clearOpsEvents skipped: ops_events is append-only in persistent mode');
}