import { useEffect, useState, useCallback } from 'react';
import { useOrg } from '@/hooks/use-org';
import { appendOpsEvent, getOpsEvents, type OpsEvent } from '@/lib/ops-events';

export function useOpsEvents() {
  const { currentOrg } = useOrg();
  const [events, setEvents] = useState<OpsEvent[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => { getOpsEvents().then(e => { if (alive) setEvents(e); }).catch(() => {}); };
    load();
    window.addEventListener('clarity-ops-events', load);
    return () => { alive = false; window.removeEventListener('clarity-ops-events', load); };
  }, []);

  // Wrap appendOpsEvent to auto-inject the current org_id.
  const append = useCallback(
    (ev: Omit<OpsEvent, 'event_id' | 'occurred_at' | 'created_at' | 'actor_user_id' | 'actor_email' | 'actor_name' | 'org_id'> & { actor?: string | null }) =>
      appendOpsEvent({ ...ev, org_id: currentOrg?.org_id ?? '' }),
    [currentOrg],
  );

  return { events, append };
}
