import { useEffect, useState } from 'react';
import { listRemittanceBatches, REMITTANCE_BATCH_EVENT } from '@/lib/remittance-batches';
import type { RemittanceBatchSummary } from '@/types/import';
import { IMPORT_BATCH_EVENT } from '@/lib/import-batches';

export function useRemittanceBatches() {
  const [batches, setBatches] = useState<RemittanceBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    listRemittanceBatches()
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(REMITTANCE_BATCH_EVENT, h);
    window.addEventListener(IMPORT_BATCH_EVENT, h);
    return () => {
      window.removeEventListener(REMITTANCE_BATCH_EVENT, h);
      window.removeEventListener(IMPORT_BATCH_EVENT, h);
    };
  }, []);

  return { batches, loading, refresh };
}
