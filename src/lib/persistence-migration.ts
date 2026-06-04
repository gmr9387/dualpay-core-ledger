/**
 * One-time migration of Phase 1–6 localStorage state into Supabase.
 * Safe to call repeatedly — gated by a flag and never blocks startup.
 */
import { supabase } from '@/integrations/supabase/client';

const FLAG = 'clarity:ls-migration:v1';

interface LocalAssignment {
  claim_id: string;
  assignee?: string;
  status?: string;
  updated_at?: string;
}

interface LocalOpsEvent {
  event_id?: string;
  occurred_at?: string;
  kind: string;
  claim_id?: string | null;
  actor?: string | null;
  summary: string;
  payload?: Record<string, unknown> | null;
}

let inflight: Promise<void> | null = null;

export function migrateLocalStorageOnce(): Promise<void> {
  if (inflight) return inflight;
  if (typeof localStorage === 'undefined') return Promise.resolve();
  if (localStorage.getItem(FLAG)) return Promise.resolve();

  inflight = (async () => {
    try {
      // Assignments
      const aRaw = localStorage.getItem('clarity:assignments:v1');
      if (aRaw) {
        try {
          const parsed = JSON.parse(aRaw) as Record<string, LocalAssignment>;
          const rows = Object.values(parsed).map(a => ({
            claim_id: a.claim_id,
            assignee: a.assignee ?? null,
            status: (a.status as string) ?? 'open',
            updated_at: a.updated_at ?? new Date().toISOString(),
          }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('claim_assignments')
              .upsert(rows as never, { onConflict: 'claim_id' });
            if (error) console.warn('[migrate] assignments failed', error.message);
          }
        } catch (e) { console.warn('[migrate] assignments parse failed', e); }
      }

      // Ops events
      const eRaw = localStorage.getItem('clarity:ops-events:v1');
      if (eRaw) {
        try {
          const parsed = JSON.parse(eRaw) as LocalOpsEvent[];
          const rows = parsed.map(ev => ({
            event_id: ev.event_id ?? `EV-MIG-${Math.random().toString(36).slice(2, 10)}`,
            occurred_at: ev.occurred_at ?? new Date().toISOString(),
            kind: ev.kind,
            claim_id: ev.claim_id ?? null,
            actor: ev.actor ?? 'migrated',
            summary: ev.summary,
            payload: (ev.payload ?? null) as never,
          }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('ops_events')
              .upsert(rows as never, { onConflict: 'event_id' });
            if (error) console.warn('[migrate] ops_events failed', error.message);
          }
        } catch (e) { console.warn('[migrate] ops_events parse failed', e); }
      }

      // Outcomes — migration is handled by seedOutcomesIfEmpty when localStorage is the source of truth
      const oRaw = localStorage.getItem('clarity:outcomes:v1');
      if (oRaw) {
        try {
          const parsed = JSON.parse(oRaw) as Record<string, Record<string, unknown>>;
          const rows = Object.values(parsed).map(o => ({
            outcome_id: String(o.outcome_id),
            claim_id: String(o.claim_id),
            denial_id: (o.denial_id as string) ?? null,
            payer_id: (o.payer_id as string) ?? null,
            resolution_type: String(o.resolution_type),
            resolution_date: String(o.resolution_date ?? new Date().toISOString()),
            denied_amount_cents: Number(o.denied_amount_cents ?? 0),
            recovered_amount_cents: Number(o.recovered_amount_cents ?? 0),
            unrecovered_amount_cents: Number(o.unrecovered_amount_cents ?? 0),
            notes: (o.notes as string) ?? null,
            payload: {
              payer_name: o.payer_name,
              category: o.category,
              workflow_owner: o.workflow_owner,
              playbook_used: o.playbook_used,
              denial_date: o.denial_date,
              days_to_resolution: o.days_to_resolution,
              predicted_recoverability_score: o.predicted_recoverability_score,
            } as never,
          }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('recovery_outcomes')
              .upsert(rows as never, { onConflict: 'outcome_id' });
            if (error) console.warn('[migrate] outcomes failed', error.message);
          }
        } catch (e) { console.warn('[migrate] outcomes parse failed', e); }
      }

      localStorage.setItem(FLAG, new Date().toISOString());
    } catch (e) {
      console.warn('[migrate] non-fatal failure', e);
    }
  })();

  return inflight;
}
