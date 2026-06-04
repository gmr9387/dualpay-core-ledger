/**
 * Phase 15 — Contract Match Engine.
 * Selects the applicable contract version for a (payer, service_date, procedure_code)
 * by intersecting effective/termination windows and matching payer name.
 */
import type { PayerContract, FeeScheduleRow } from '@/types/contracts';

export interface ContractMatch {
  contract: PayerContract;
  fee?: FeeScheduleRow;
  reason: string;
}

function payerEq(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function matchContract(
  contracts: PayerContract[],
  fees: FeeScheduleRow[],
  input: { payer_name: string; service_date: string; procedure_code?: string; modifier?: string | null },
): ContractMatch | null {
  const svc = input.service_date;
  const candidates = contracts.filter(c => {
    if (!payerEq(c.payer_name, input.payer_name)) return false;
    if (svc < c.effective_date) return false;
    if (c.termination_date && svc > c.termination_date) return false;
    return true;
  });
  if (!candidates.length) return null;

  // Pick newest effective_date (latest applicable version).
  candidates.sort((a, b) =>
    b.effective_date.localeCompare(a.effective_date)
    || String(b.version).localeCompare(String(a.version)));
  const contract = candidates[0];

  let fee: FeeScheduleRow | undefined;
  if (input.procedure_code) {
    const contractFees = fees.filter(f => f.contract_id === contract.contract_id
      && f.procedure_code.toUpperCase() === input.procedure_code!.toUpperCase());
    fee = contractFees.find(f => (f.modifier ?? '') === (input.modifier ?? ''))
       ?? contractFees.find(f => !f.modifier)
       ?? contractFees[0];
  }
  return {
    contract,
    fee,
    reason: fee
      ? `Matched ${contract.payer_name} ${contract.contract_name} v${contract.version} (CPT ${input.procedure_code})`
      : `Matched ${contract.payer_name} ${contract.contract_name} v${contract.version}, no fee row for ${input.procedure_code ?? '—'}`,
  };
}
