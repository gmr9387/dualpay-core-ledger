/**
 * Recovery Factory — Import types
 */

export type ImportSourceType =
  | 'denial_export'
  | 'aging_report'
  | 'underpayment_report'
  | 'appeal_status'
  | 'payer_followup';

export const SOURCE_LABEL: Record<ImportSourceType, string> = {
  denial_export: 'Denial Export',
  aging_report: 'Aging Report',
  underpayment_report: 'Underpayment Report',
  appeal_status: 'Appeal Status Report',
  payer_followup: 'Payer Follow-Up Report',
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
  | 'appeal_level';

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
