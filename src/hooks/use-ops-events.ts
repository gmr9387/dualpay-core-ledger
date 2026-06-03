import { useEffect, useState } from 'react';
import { appendOpsEvent, getOpsEvents, type OpsEvent } from '@/lib/ops-events';

export function useOpsEvents() {
  const [events, setEvents] = useState<OpsEvent[]>(() => getOpsEvents());
  useEffect(() => {
    const h = () => setEvents(getOpsEvents());
    window.addEventListener('clarity-ops-events', h);
    return () => window.removeEventListener('clarity-ops-events', h);
  }, []);
  return { events, append: appendOpsEvent };
}
