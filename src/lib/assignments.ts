/**
 * Lightweight client-side assignment store.
 * Persists assignee + working status per claim in localStorage so
 * Phase 2 operational gestures (assign, mark working, snooze) feel
 * real without requiring backend schema changes.
 */
const KEY = 'clarity:assignments:v1';

export type WorkingStatus = 'open' | 'in_progress' | 'snoozed' | 'resolved';

export interface Assignment {
  claim_id: string;
  assignee?: string;
  status: WorkingStatus;
  updated_at: string;
}

type Store = Record<string, Assignment>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Store; }
  catch { return {}; }
}
function write(s: Store) { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event('clarity-assignments')); }

export function getAssignment(claimId: string): Assignment {
  return read()[claimId] ?? { claim_id: claimId, status: 'open', updated_at: new Date().toISOString() };
}
export function getAllAssignments(): Store { return read(); }
export function setAssignment(claimId: string, patch: Partial<Assignment>) {
  const s = read();
  const cur = s[claimId] ?? { claim_id: claimId, status: 'open' as WorkingStatus, updated_at: new Date().toISOString() };
  s[claimId] = { ...cur, ...patch, claim_id: claimId, updated_at: new Date().toISOString() };
  write(s);
}

export const ASSIGNEES = [
  'M. Alvarez (Appeals Lead)',
  'J. Chen (Senior Biller)',
  'R. Okafor (Auth Team)',
  'P. Singh (Clinical Liaison)',
  'D. Nakamura (COB)',
  'K. Brooks (Coding QA)',
];
