import { useEffect, useState } from 'react';
import { getAllOutcomes, seedOutcomesIfEmpty } from '@/lib/outcomes';
import type { RecoveryOutcome } from '@/types/outcomes';
import { useClarityData } from './use-clarity-data';

export function useOutcomes(): { outcomes: RecoveryOutcome[]; loading: boolean } {
  const { data: claims, isLoading } = useClarityData();
  const [outcomes, setOutcomes] = useState<RecoveryOutcome[]>([]);

  useEffect(() => {
    if (!claims) return;
    seedOutcomesIfEmpty(claims);
    setOutcomes(getAllOutcomes());
    const sync = () => setOutcomes(getAllOutcomes());
    window.addEventListener('clarity-outcomes', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('clarity-outcomes', sync);
      window.removeEventListener('storage', sync);
    };
  }, [claims]);

  return { outcomes, loading: isLoading };
}
