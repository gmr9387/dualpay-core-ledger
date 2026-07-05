/**
 * Minimal no-op ContractTerms and PlanBenefits stubs for non-demo (live)
 * environments. Used wherever ClaimWorkspace requires typed props but no real
 * contract/plan has been fetched from the database yet.
 */
import type { ContractTerms, PlanBenefits } from '@/types/claim';

export const LIVE_CONTRACT: ContractTerms = {
  contract_id: '', contract_version: '', provider_npi: '',
  effective_date: '', term_date: '', fee_schedule_id: '',
  fee_schedule: new Map(), reimbursement_method: 'fee_schedule',
};

export const LIVE_PLAN: PlanBenefits = {
  plan_id: '', plan_version: '', plan_name: '', plan_year: 0,
  deductible_individual: 0, deductible_family: 0,
  oop_max_individual: 0, oop_max_family: 0,
  coinsurance_rate: 0, cob_policy: 'standard', covered_services: [],
};
