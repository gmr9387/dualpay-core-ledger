import { useEffect, useState } from 'react';
import { listBatches, IMPORT_BATCH_EVENT } from '@/lib/import-batches';
import type { ImportBatch } from '@/types/import';

export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    listBatches().then(setBatches).catch(() => setBatches([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(IMPORT_BATCH_EVENT, h);
    return () => window.removeEventListener(IMPORT_BATCH_EVENT, h);
  }, []);

  return { batches, loading, refresh };
}
