/**
 * Append-only operations event log (localStorage).
 *
 * Records assignments, escalations, SLA breaches acknowledged,
 * payer follow-ups, and workflow transitions for audit / replay.
 */
const KEY = 'clarity:ops-events:v1';

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
  claim_id?: string;
  actor?: string;
  summary: string;
  payload?: Record<string, unknown>;
}

function read(): OpsEvent[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as OpsEvent[]; }
  catch { return []; }
}
function write(list: OpsEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('clarity-ops-events'));
}

export function getOpsEvents(): OpsEvent[] {
  return read().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function appendOpsEvent(ev: Omit<OpsEvent, 'event_id' | 'occurred_at'> & { actor?: string }) {
  const list = read();
  list.push({
    ...ev,
    actor: ev.actor ?? 'Current User',
    event_id: `EV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    occurred_at: new Date().toISOString(),
  });
  // Cap retention so localStorage stays small.
  write(list.slice(-2000));
}

export function clearOpsEvents() { write([]); }
