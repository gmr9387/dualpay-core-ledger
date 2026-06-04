import { useEffect, useState } from 'react';
import { getAllOutcomes, isOutcomeCacheLoaded, loadOutcomes, seedOutcomesIfEmpty } from '@/lib/outcomes';
import type { RecoveryOutcome } from '@/types/outcomes';
import { useClarityData } from './use-clarity-data';
import { migrateLocalStorageOnce } from '@/lib/persistence-migration';

export function useOutcomes(): { outcomes: RecoveryOutcome[]; loading: boolean } {
  const { data: claims, isLoading } = useClarityData();
  const [outcomes, setOutcomes] = useState<RecoveryOutcome[]>(() => getAllOutcomes());
  const [loading, setLoading] = useState<boolean>(!isOutcomeCacheLoaded());

  useEffect(() => {
    if (!claims) return;
    let alive = true;
    const sync = () => {
      loadOutcomes().then(list => { if (alive) { setOutcomes(list); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    };
    (async () => {
      try {
        await migrateLocalStorageOnce();
        await seedOutcomesIfEmpty(claims);
      } catch (e) {
        console.error('[outcomes] init failed', e);
      } finally {
        sync();
      }
    })();
    window.addEventListener('clarity-outcomes', sync);
    return () => { alive = false; window.removeEventListener('clarity-outcomes', sync); };
  }, [claims]);

  return { outcomes, loading: isLoading || loading };
}
