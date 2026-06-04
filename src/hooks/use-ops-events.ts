import { useEffect, useState } from 'react';
import { appendOpsEvent, getOpsEvents, type OpsEvent } from '@/lib/ops-events';

export function useOpsEvents() {
  const [events, setEvents] = useState<OpsEvent[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => { getOpsEvents().then(e => { if (alive) setEvents(e); }).catch(() => {}); };
    load();
    window.addEventListener('clarity-ops-events', load);
    return () => { alive = false; window.removeEventListener('clarity-ops-events', load); };
  }, []);

  return { events, append: appendOpsEvent };
}
