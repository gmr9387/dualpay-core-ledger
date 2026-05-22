import { useEffect, useState } from 'react';
import { getAllAssignments, setAssignment, type Assignment, type WorkingStatus, ASSIGNEES } from '@/lib/assignments';

export function useAssignments() {
  const [store, setStore] = useState<Record<string, Assignment>>(() => getAllAssignments());
  useEffect(() => {
    const h = () => setStore(getAllAssignments());
    window.addEventListener('clarity-assignments', h);
    return () => window.removeEventListener('clarity-assignments', h);
  }, []);
  return {
    store,
    get: (id: string): Assignment => store[id] ?? { claim_id: id, status: 'open' as WorkingStatus, updated_at: '' },
    assign: (id: string, assignee: string | undefined) => setAssignment(id, { assignee }),
    setStatus: (id: string, status: WorkingStatus) => setAssignment(id, { status }),
    assignees: ASSIGNEES,
  };
}
