/**
 * Recovery Factory — Import types
 */

export type ImportSourceType =
  | 'denial_export'
  | 'aging_report'
  | 'underpayment_report'
  | 'appeal_status'
  | 'payer_followup'
  | 'remittance_835';

export const SOURCE_LABEL: Record<ImportSourceType, string> = {
  denial_export: 'Denial Export',
  aging_report: 'Aging Report',
  underpayment_report: 'Underpayment Report',
  appeal_status: 'Appeal Status Report',
  payer_followup: 'Payer Follow-Up Report',
  remittance_835: '835 Remittance',
};

/** Canonical target fields the engine knows how to consume. */
export type CanonicalField =
  | 'claim_id'
  | 'payer_name'
  | 'member_id'
  | 'provider_npi'
  | 'provider_name'
  | 'service_date'
  | 'submitted_date'
  | 'billed_amount'
  | 'allowed_amount'
  | 'paid_amount'
  | 'amount_at_risk'
  | 'carc_code'
  | 'rarc_code'
  | 'group_code'
  | 'denial_message'
  | 'procedure_code'
  | 'aging_days'
  | 'appeal_status'
  | 'appeal_level'
  // Phase 10 — 835 remittance fields
  | 'patient_responsibility'
  | 'adjustment_amount'
  | 'payment_reference'
  | 'check_number'
  | 'remittance_date';

export interface CanonicalFieldDef {
  key: CanonicalField;
  label: string;
  required: boolean;
  aliases: string[]; // lower-case header substrings used for auto-detection
  kind: 'string' | 'date' | 'money' | 'int';
}

export type FieldMapping = Partial<Record<CanonicalField, string>>;

export type ValidationLevel = 'ok' | 'warning' | 'error';

export interface RowIssue {
  level: ValidationLevel;
  field?: CanonicalField;
  message: string;
}

export interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  normalized: Partial<Record<CanonicalField, string | number>>;
  issues: RowIssue[];
  status: ValidationLevel;
}

export interface ValidationSummary {
  total: number;
  ok: number;
  warning: number;
  error: number;
  duplicates: number;
  import_score: number; // 0-100
  issues_by_field: Record<string, number>;
}

export interface ImportBatch {
  batch_id: string;
  file_name: string;
  source_type: ImportSourceType;
  uploaded_by: string | null;
  status: 'pending' | 'validated' | 'committed' | 'failed';
  record_count: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  import_score: number;
  mapping: FieldMapping;
  validation: ValidationSummary | Record<string, never>;
  generated_claim_ids: string[];
  expected_recovery_cents: number;
  uploaded_at: string;
  committed_at: string | null;
}

// ─── Phase 10 — Remittance ─────────────────────────────────────────────────

/** Canonical remittance line emitted by the normalizer. */
export interface CanonicalRemittance {
  claim_id: string;
  payer_name: string;
  service_date?: string;
  remittance_date?: string;
  payment_reference?: string;
  check_number?: string;
  billed_cents: number;
  allowed_cents: number;
  paid_cents: number;
  patient_resp_cents: number;
  adjustment_cents: number;
  carc_code?: string;
  rarc_code?: string;
  group_code?: 'CO' | 'PR' | 'OA' | 'PI' | 'CR';
  denial_reason?: string;
  procedure_code?: string;
  member_id?: string;
  provider_npi?: string;
  provider_name?: string;
}

export type RemittanceOpportunityKind =
  | 'denial'
  | 'underpayment'
  | 'cob'
  | 'contractual'
  | 'paid_in_full';

export interface RemittanceClassification {
  kind: RemittanceOpportunityKind;
  amount_at_risk_cents: number;
  reason: string;
}

export interface RemittanceBatchSummary {
  batch_id: string;
  file_name: string;
  payer_name: string | null;
  record_count: number;
  denial_count: number;
  underpayment_count: number;
  cob_count: number;
  total_billed_cents: number;
  total_paid_cents: number;
  total_adjustment_cents: number;
  expected_recovery_cents: number;
  imported_by: string | null;
  uploaded_at: string;
}
