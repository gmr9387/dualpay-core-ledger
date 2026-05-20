// Core domain types for DualPay adjudication

export interface ClaimLine {
  line_id: string;
  claim_id: string;
  service_date: string; // ISO date
  claim_line_number: number;
  procedure_code: string;
  procedure_modifier?: string;
  diagnosis_codes: string[];
  billed_amount: number; // cents
  units: number;
  place_of_service: string;
  rendering_provider_npi?: string;
  revenue_code?: string;
}

export interface Claim {
  claim_id: string;
  member_id: string;
  provider_npi: string;
  provider_name: string;
  facility_name?: string;
  claim_type: 'professional' | 'institutional';
  received_date: string;
  service_date_from: string;
  service_date_to: string;
  total_billed: number; // cents
  lines: ClaimLine[];
  ohi_indicators: OHIIndicator[];
  status: ClaimStatus;
  case_id?: string;
  /** Operational intelligence envelope — populated by Claim Clarity. */
  intel?: import('./clarity').ClaimIntel;
}

export type ClaimStatus =
  | 'RECEIVED'
  | 'ELIGIBILITY_CHECK'
  | 'COB_ROUTED'
  | 'AWAITING_PRIMARY_EOB'
  | 'IN_ADJUDICATION'
  | 'PENDED'
  | 'ADJUDICATED'
  | 'PAYMENT_IN_PROGRESS'
  | 'PAID'
  | 'DENIED'
  | 'REVERSED'
  | 'ADJUSTED';

export interface OHIIndicator {
  payer_id: string;
  payer_name: string;
  coverage_type: string;
  primacy_order?: number;
  subscriber_id?: string;
  group_number?: string;
}

export interface MemberAccumulators {
  member_id: string;
  plan_year: number;
  individual_deductible_used: number; // cents
  individual_deductible_max: number;
  family_deductible_used: number;
  family_deductible_max: number;
  individual_oop_used: number;
  individual_oop_max: number;
  family_oop_used: number;
  family_oop_max: number;
  benefit_limits: BenefitLimit[];
}

export interface BenefitLimit {
  benefit_category: string;
  period: 'annual' | 'lifetime' | 'per_occurrence';
  used: number;
  max: number;
  unit: 'dollars' | 'visits' | 'days';
}

export interface ContractTerms {
  contract_id: string;
  contract_version: string;
  provider_npi: string;
  effective_date: string;
  term_date: string;
  fee_schedule_id: string;
  fee_schedule: Map<string, number>; // procedure_code -> allowed_cents
  reimbursement_method: 'fee_schedule' | 'percent_of_billed' | 'per_diem' | 'drg';
  percent_of_billed?: number;
}

export interface PlanBenefits {
  plan_id: string;
  plan_version: string;
  plan_name: string;
  plan_year: number;
  deductible_individual: number;
  deductible_family: number;
  oop_max_individual: number;
  oop_max_family: number;
  coinsurance_rate: number; // 0-1, member's share after deductible
  copay_amount?: number; // cents, if applicable
  copay_applies_to?: string[]; // procedure codes or categories
  cob_policy: COBPolicyType;
  covered_services: CoveredService[];
}

export interface CoveredService {
  category: string;
  procedure_codes?: string[];
  requires_auth: boolean;
  benefit_limit?: BenefitLimit;
}

export type COBPolicyType = 'standard' | 'non_duplication' | 'carve_out' | 'maintenance_of_benefits';

export interface PriorPayerOutcome {
  payer_id: string;
  payer_name: string;
  claim_line_id: string;
  billed: number;
  allowed: number;
  paid: number;
  patient_responsibility: number;
  adjustments: PriorAdjustment[];
  source: 'edi_835' | 'ocr_pdf' | 'manual_entry';
  confidence: number; // 0-1
  source_document_ref?: string;
}

export interface PriorAdjustment {
  carc_code: string;
  rarc_code?: string;
  amount: number;
  group_code: string; // CO, PR, OA, PI, CR
}

// Adjudication output per line
export interface AdjudicationLineResult {
  line_id: string;
  claim_id: string;
  allowed: number;
  deductible_applied: number;
  coinsurance: number;
  copay: number;
  plan_paid: number;
  member_responsibility: number;
  adjustments: AdjustmentDetail[];
  cob_allocations: COBAllocation[];
  status: 'paid' | 'denied' | 'adjusted';
  denial_reasons?: string[];
}

export interface AdjustmentDetail {
  reason_code: string;
  amount: number;
  category: 'contractual' | 'non_covered' | 'deductible' | 'coinsurance' | 'copay' | 'cob' | 'other';
}

export interface COBAllocation {
  payer_id: string;
  payer_order: number;
  allowed: number;
  paid: number;
  adjustment: number;
  method: COBPolicyType;
}

// Session accumulator (immutable per step)
export interface SessionAccumulator {
  deductible_remaining: number;
  oop_remaining: number;
  benefit_limits_remaining: Map<string, number>;
  lines_processed: string[];
}

// Adjudication run
export interface AdjudicationRun {
  run_id: string;
  claim_id: string;
  timestamp: string;
  line_processing_order: string[]; // line_ids in order
  line_results: AdjudicationLineResult[];
  final_accumulator: SessionAccumulator;
  total_plan_paid: number;
  total_member_responsibility: number;
  trace_id: string;
  calc_policy_version: string;
}
