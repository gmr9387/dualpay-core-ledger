/**
 * Demo scenario data for the DualPay admin dashboard
 */
import type { ClaimLine, MemberAccumulators, ContractTerms, PlanBenefits, PriorPayerOutcome, Claim } from '@/types/claim';
import type { Case, CaseEvent } from '@/types/case';

export function createDemoFeeSchedule(): Map<string, number> {
  const fs = new Map<string, number>();
  fs.set('99213', 12000);
  fs.set('99214', 18000);
  fs.set('99215', 25000);
  fs.set('99203', 15000);
  fs.set('99204', 22000);
  fs.set('85025', 3500);
  fs.set('80053', 4200);
  fs.set('71046', 9500);
  return fs;
}

export const demoClaims: Claim[] = [
  {
    claim_id: 'CLM-2024-00147',
    member_id: 'MEM-88421',
    provider_npi: '1234567890',
    provider_name: 'Dr. Sarah Chen',
    facility_name: 'Metro Health Clinic',
    claim_type: 'professional',
    received_date: '2024-03-18',
    service_date_from: '2024-03-15',
    service_date_to: '2024-03-15',
    total_billed: 35000,
    lines: [
      { line_id: 'L1-147', claim_id: 'CLM-2024-00147', service_date: '2024-03-15', claim_line_number: 1, procedure_code: '99214', diagnosis_codes: ['J06.9', 'R05.9'], billed_amount: 20000, units: 1, place_of_service: '11' },
      { line_id: 'L2-147', claim_id: 'CLM-2024-00147', service_date: '2024-03-15', claim_line_number: 2, procedure_code: '85025', diagnosis_codes: ['J06.9'], billed_amount: 8500, units: 1, place_of_service: '11' },
      { line_id: 'L3-147', claim_id: 'CLM-2024-00147', service_date: '2024-03-15', claim_line_number: 3, procedure_code: '80053', diagnosis_codes: ['J06.9'], billed_amount: 6500, units: 1, place_of_service: '11' },
    ],
    ohi_indicators: [],
    status: 'ADJUDICATED',
    case_id: 'CASE-2024-001',
  },
  {
    claim_id: 'CLM-2024-00152',
    member_id: 'MEM-77203',
    provider_npi: '9876543210',
    provider_name: 'Dr. James Park',
    facility_name: 'Valley Medical Group',
    claim_type: 'professional',
    received_date: '2024-03-20',
    service_date_from: '2024-03-18',
    service_date_to: '2024-03-18',
    total_billed: 52000,
    lines: [
      { line_id: 'L1-152', claim_id: 'CLM-2024-00152', service_date: '2024-03-18', claim_line_number: 1, procedure_code: '99215', diagnosis_codes: ['M54.5'], billed_amount: 30000, units: 1, place_of_service: '11' },
      { line_id: 'L2-152', claim_id: 'CLM-2024-00152', service_date: '2024-03-18', claim_line_number: 2, procedure_code: '71046', diagnosis_codes: ['M54.5'], billed_amount: 22000, units: 1, place_of_service: '11' },
    ],
    ohi_indicators: [{ payer_id: 'BCBS-PRIMARY', payer_name: 'BlueCross BlueShield', coverage_type: 'medical', primacy_order: 1, subscriber_id: 'BC-4421' }],
    status: 'COB_ROUTED',
  },
  {
    claim_id: 'CLM-2024-00160',
    member_id: 'MEM-55810',
    provider_npi: '5555555555',
    provider_name: 'Dr. Maria Lopez',
    claim_type: 'professional',
    received_date: '2024-03-22',
    service_date_from: '2024-03-20',
    service_date_to: '2024-03-20',
    total_billed: 20000,
    lines: [
      { line_id: 'L1-160', claim_id: 'CLM-2024-00160', service_date: '2024-03-20', claim_line_number: 1, procedure_code: '99213', diagnosis_codes: ['Z00.00'], billed_amount: 15000, units: 1, place_of_service: '11' },
      { line_id: 'L2-160', claim_id: 'CLM-2024-00160', service_date: '2024-03-20', claim_line_number: 2, procedure_code: 'ZZZZ', diagnosis_codes: ['Z00.00'], billed_amount: 5000, units: 1, place_of_service: '11' },
    ],
    ohi_indicators: [],
    status: 'RECEIVED',
    case_id: 'CASE-2024-001',
  },
];

export const demoAccumulators: Record<string, MemberAccumulators> = {
  'MEM-88421': {
    member_id: 'MEM-88421',
    plan_year: 2024,
    individual_deductible_used: 45000,
    individual_deductible_max: 100000,
    family_deductible_used: 75000,
    family_deductible_max: 300000,
    individual_oop_used: 85000,
    individual_oop_max: 500000,
    family_oop_used: 120000,
    family_oop_max: 1000000,
    benefit_limits: [],
  },
  'MEM-77203': {
    member_id: 'MEM-77203',
    plan_year: 2024,
    individual_deductible_used: 100000,
    individual_deductible_max: 100000,
    family_deductible_used: 200000,
    family_deductible_max: 300000,
    individual_oop_used: 150000,
    individual_oop_max: 500000,
    family_oop_used: 200000,
    family_oop_max: 1000000,
    benefit_limits: [],
  },
  'MEM-55810': {
    member_id: 'MEM-55810',
    plan_year: 2024,
    individual_deductible_used: 0,
    individual_deductible_max: 150000,
    family_deductible_used: 0,
    family_deductible_max: 450000,
    individual_oop_used: 0,
    individual_oop_max: 600000,
    family_oop_used: 0,
    family_oop_max: 1200000,
    benefit_limits: [],
  },
};

export const demoContract: ContractTerms = {
  contract_id: 'CTR-2024-001',
  contract_version: '2.1',
  provider_npi: '1234567890',
  effective_date: '2024-01-01',
  term_date: '2024-12-31',
  fee_schedule_id: 'FS-STANDARD-2024',
  fee_schedule: createDemoFeeSchedule(),
  reimbursement_method: 'fee_schedule',
};

export const demoPlan: PlanBenefits = {
  plan_id: 'PLAN-GOLD-PPO',
  plan_version: '3.0',
  plan_name: 'Gold PPO 1000',
  plan_year: 2024,
  deductible_individual: 100000,
  deductible_family: 300000,
  oop_max_individual: 500000,
  oop_max_family: 1000000,
  coinsurance_rate: 0.2,
  cob_policy: 'standard',
  covered_services: [],
};

export const demoPriorOutcomes: PriorPayerOutcome[] = [
  {
    payer_id: 'BCBS-PRIMARY',
    payer_name: 'BlueCross BlueShield',
    claim_line_id: 'L1-152',
    billed: 30000,
    allowed: 24000,
    paid: 19200,
    patient_responsibility: 4800,
    adjustments: [{ carc_code: '45', amount: 6000, group_code: 'CO' }, { carc_code: '2', amount: 4800, group_code: 'PR' }],
    source: 'edi_835',
    confidence: 1.0,
  },
  {
    payer_id: 'BCBS-PRIMARY',
    payer_name: 'BlueCross BlueShield',
    claim_line_id: 'L2-152',
    billed: 22000,
    allowed: 9000,
    paid: 7200,
    patient_responsibility: 1800,
    adjustments: [{ carc_code: '45', amount: 13000, group_code: 'CO' }, { carc_code: '2', amount: 1800, group_code: 'PR' }],
    source: 'edi_835',
    confidence: 1.0,
  },
];

// ── Demo Cases ────────────────────────────────────────────────

export const demoCases: Case[] = [
  {
    case_id: 'CASE-2024-001',
    member_id: 'MEM-88421',
    created_at: '2024-03-18T10:00:00Z',
    status: 'OPEN',
    claim_ids: ['CLM-2024-00147', 'CLM-2024-00160'],
    description: 'Multiple claims for MEM-88421 — cross-claim deductible tracking',
    tags: ['multi-claim', 'deductible-tracking'],
  },
];

export const demoCaseEvents: CaseEvent[] = [
  {
    event_id: 'EVT-001',
    case_id: 'CASE-2024-001',
    timestamp: '2024-03-18T10:00:00Z',
    event_type: 'CASE_CREATED',
    description: 'Case opened for member MEM-88421 to track cross-claim accumulator impact.',
  },
  {
    event_id: 'EVT-002',
    case_id: 'CASE-2024-001',
    timestamp: '2024-03-18T10:01:00Z',
    event_type: 'CLAIM_LINKED',
    claim_id: 'CLM-2024-00147',
    description: 'Claim CLM-2024-00147 linked — adjudicated, deductible applied across 3 lines.',
  },
  {
    event_id: 'EVT-003',
    case_id: 'CASE-2024-001',
    timestamp: '2024-03-22T14:30:00Z',
    event_type: 'CLAIM_LINKED',
    claim_id: 'CLM-2024-00160',
    description: 'Claim CLM-2024-00160 linked — same member, subsequent service date.',
  },
  {
    event_id: 'EVT-004',
    case_id: 'CASE-2024-001',
    timestamp: '2024-03-22T14:35:00Z',
    event_type: 'ACCUMULATOR_UPDATED',
    description: 'Session accumulators updated: deductible carry-forward from CLM-00147 applied to CLM-00160 adjudication.',
  },
];
