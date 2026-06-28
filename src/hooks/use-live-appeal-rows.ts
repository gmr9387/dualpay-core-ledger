/**
 * useLiveAppealRows — B-3 (Phase 3D)
 *
 * Replaces the demo clarity data dependency in AppealsWorkbench with live
 * ops_events rows.  Groups appeal events by (claim_id) and resolves each
 * claim's latest appeal state using MAX(occurred_at).
 *
 * Returns one LiveAppealRow per claim that has at least one appeal event,
 * shaped to match the fields the AppealsWorkbench table renders.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Maps ops_events appeal kind → AppealStatus used by the UI */
const KIND_TO_STATUS: Record<string, LiveAppealStatus> = {
  appeal_submitted: 'submitted',
  appeal_responded: 'in_review',
  appeal_resolved: 'resolved',
};

export type LiveAppealStatus = 'submitted' | 'in_review' | 'resolved' | 'won' | 'lost' | 'withdrawn';

export interface LiveAppealRow {
  claim_id: string;
  /** Latest appeal status derived from the most recent ops_event */
  status: LiveAppealStatus;
  /** ISO timestamp of the most recent appeal event */
  last_activity_at: string;
  /** Number of appeal events logged for this claim */
  event_count: number;
  /** Payer name from payload if available */
  payer_name: string | null;
  /** Disputed amount in cents from the first appeal_submitted payload */
  amount_in_dispute_cents: number;
  /** Recovered amount in cents from the appeal_resolved payload if won */
  amount_recovered_cents: number | null;
  /** Most recent event kind */
  latest_kind: string;
  /** Most recent event payload */
  latest_payload: Record<string, unknown> | null;
}

export function useLiveAppealRows(orgId: string) {
  const [rows, setRows] = useState<LiveAppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    supabase
      .from('ops_events')
      .select('event_id, claim_id, kind, occurred_at, payload')
      .eq('org_id', orgId)
      .in('kind', ['appeal_submitted', 'appeal_responded', 'appeal_resolved'])
      .order('occurred_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }

        const events = data ?? [];

        // Group by claim_id
        const byClaimId = new Map<string, typeof events>();
        for (const e of events) {
          if (!e.claim_id) continue;
          const arr = byClaimId.get(e.claim_id) ?? [];
          arr.push(e);
          byClaimId.set(e.claim_id, arr);
        }

        const result: LiveAppealRow[] = [];
        for (const [claimId, claimEvents] of byClaimId.entries()) {
          // Latest event (events are ordered asc, so last item is newest)
          const latest = claimEvents[claimEvents.length - 1];
          const latestPayload = (latest.payload as Record<string, unknown> | null) ?? null;

          // Derive status from latest event
          let status: LiveAppealStatus = KIND_TO_STATUS[latest.kind] ?? 'submitted';
          if (latest.kind === 'appeal_resolved') {
            const appealStatus = latestPayload?.appeal_status as string | undefined;
            if (appealStatus === 'won') status = 'won';
            else if (appealStatus === 'lost') status = 'lost';
            else if (appealStatus === 'withdrawn') status = 'withdrawn';
            else status = 'resolved';
          }

          // Disputed amount from first appeal_submitted event
          const firstSubmit = claimEvents.find(e => e.kind === 'appeal_submitted');
          const firstPayload = (firstSubmit?.payload as Record<string, unknown> | null) ?? null;
          const amountInDisputeCents = typeof firstPayload?.amount_in_dispute_cents === 'number'
            ? firstPayload.amount_in_dispute_cents
            : 0;

          // Recovered amount from appeal_resolved event payload
          const resolvedEvent = [...claimEvents].reverse().find(e => e.kind === 'appeal_resolved');
          const resolvedPayload = (resolvedEvent?.payload as Record<string, unknown> | null) ?? null;
          const amountRecoveredCents = typeof resolvedPayload?.amount_recovered_cents === 'number'
            ? resolvedPayload.amount_recovered_cents
            : null;

          result.push({
            claim_id: claimId,
            status,
            last_activity_at: latest.occurred_at,
            event_count: claimEvents.length,
            payer_name: typeof latestPayload?.payer_name === 'string' ? latestPayload.payer_name : null,
            amount_in_dispute_cents: amountInDisputeCents,
            amount_recovered_cents: amountRecoveredCents,
            latest_kind: latest.kind,
            latest_payload: latestPayload,
          });
        }

        // Sort: most recent activity first
        result.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
        setRows(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { alive = false; };
  }, [orgId]);

  return { rows, loading, error };
}
