import { useEffect, useState, useCallback } from 'react';
import { listJobs, listRules, AUTOMATION_EVENT } from '@/lib/automation';
import type { AutomationJob, AutomationRule } from '@/types/automation';

export function useAutomationJobs(limit = 200) {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    listJobs(limit).then(setJobs).catch(() => setJobs([])).finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(AUTOMATION_EVENT, h);
    return () => window.removeEventListener(AUTOMATION_EVENT, h);
  }, [refresh]);

  return { jobs, loading, refresh };
}

export function useAutomationRules() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    listRules().then(setRules).catch(() => setRules([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(AUTOMATION_EVENT, h);
    return () => window.removeEventListener(AUTOMATION_EVENT, h);
  }, [refresh]);

  return { rules, loading, refresh };
}
