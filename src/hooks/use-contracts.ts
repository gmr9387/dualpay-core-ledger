import { useEffect, useState, useCallback } from 'react';
import {
  listContracts, listFeeSchedules, listDisputes, CONTRACT_EVENT,
} from '@/lib/contracts';
import type { PayerContract, FeeScheduleRow, UnderpaymentDispute } from '@/types/contracts';

export function useContracts() {
  const [contracts, setContracts] = useState<PayerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    listContracts().then(c => { setContracts(c); setLoading(false); });
  }, []);
  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener(CONTRACT_EVENT, h);
    return () => window.removeEventListener(CONTRACT_EVENT, h);
  }, [reload]);
  return { contracts, loading, reload };
}

export function useFeeSchedules(contract_id: string | undefined) {
  const [rows, setRows] = useState<FeeScheduleRow[]>([]);
  useEffect(() => {
    if (!contract_id) { setRows([]); return; }
    listFeeSchedules(contract_id).then(setRows);
  }, [contract_id]);
  return rows;
}

export function useDisputes() {
  const [disputes, setDisputes] = useState<UnderpaymentDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    listDisputes().then(d => { setDisputes(d); setLoading(false); });
  }, []);
  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener(CONTRACT_EVENT, h);
    return () => window.removeEventListener(CONTRACT_EVENT, h);
  }, [reload]);
  return { disputes, loading, reload };
}
