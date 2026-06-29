import { useEffect, useState } from 'react';
import {
  loadAllAssignments, getAllAssignments, setAssignment,
  _setCache, type Assignment, type WorkingStatus,
} from '@/lib/assignments';
import { migrateLocalStorageOnce } from '@/lib/persistence-migration';

export function useAssignments() {
  const [store, setStore] = useState<Record<string, Assignment>>(() => getAllAssignments());

  useEffect(() => {
    let alive = true;
    const sync = () => {
      loadAllAssignments().then(next => {
        if (!alive) return;
        _setCache(next);
        setStore(next);
      }).catch(() => {});
    };
    migrateLocalStorageOnce().finally(sync);
    window.addEventListener('clarity-assignments', sync);
    return () => { alive = false; window.removeEventListener('clarity-assignments', sync); };
  }, []);

  return {
    store,
    get: (id: string): Assignment => store[id] ?? { claim_id: id, status: 'open' as WorkingStatus, updated_at: '' },
    assign: (id: string, assignee: string | undefined) => { void setAssignment(id, { assignee }); },
    setStatus: (id: string, status: WorkingStatus) => { void setAssignment(id, { status }); },
  };
}
