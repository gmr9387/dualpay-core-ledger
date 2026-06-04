// Phase 15 — Contract Intelligence types
export type ReimbursementMethod =
  | 'fixed_fee'
  | 'percent_of_medicare'
  | 'percent_of_billed'
  | 'case_rate'
  | 'per_diem';

export type ContractType = 'commercial' | 'medicare_advantage' | 'medicaid_mco' | 'workers_comp' | 'other';

export interface PayerContract {
  contract_id: string;
  org_id: string;
  payer_name: string;
  contract_name: string;
  version: string;
  effective_date: string;
  termination_date?: string | null;
  contract_type: ContractType | string;
  uploaded_by?: string | null;
  uploaded_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface FeeScheduleRow {
  fee_schedule_id: string;
  org_id: string;
  contract_id: string;
  procedure_code: string;
  modifier?: string | null;
  contracted_amount_cents: number;
  reimbursement_method: ReimbursementMethod | string;
}

export type DisputeSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DisputeStatus = 'open' | 'in_review' | 'submitted' | 'recovered' | 'closed';

export interface UnderpaymentDispute {
  dispute_id: string;
  org_id: string;
  claim_id: string;
  contract_id?: string | null;
  payer_name: string;
  procedure_code?: string | null;
  expected_amount_cents: number;
  allowed_amount_cents: number;
  paid_amount_cents: number;
  variance_amount_cents: number;
  variance_percent: number;
  severity: DisputeSeverity | string;
  status: DisputeStatus | string;
  explanation?: string | null;
  created_at?: string;
  updated_at?: string;
}
