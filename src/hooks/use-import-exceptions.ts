import { useEffect, useState, useCallback } from 'react';
import { listExceptions, EXCEPTION_EVENT } from '@/lib/import-exceptions';
import type { ImportException, ExceptionSeverity, ExceptionStatus } from '@/types/exceptions';

interface Filter { batch_id?: string; status?: ExceptionStatus; severity?: ExceptionSeverity }

export function useImportExceptions(filter?: Filter) {
  const [exceptions, setExceptions] = useState<ImportException[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(filter ?? {});

  const refresh = useCallback(() => {
    setLoading(true);
    listExceptions(filter).then(setExceptions).catch(() => setExceptions([])).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(EXCEPTION_EVENT, h);
    return () => window.removeEventListener(EXCEPTION_EVENT, h);
  }, [refresh]);

  return { exceptions, loading, refresh };
}
