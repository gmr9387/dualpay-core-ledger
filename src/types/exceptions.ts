/**
 * Phase 9 — Import Exception Management types.
 */
import type { CanonicalField, RowIssue, ValidationLevel } from './import';

export type ExceptionStatus = 'open' | 'corrected' | 'ignored' | 'imported';
export type ExceptionSeverity = 'error' | 'warning';

export interface ImportException {
  exception_id: string;
  batch_id: string;
  row_number: number;
  source_row: Record<string, string>;
  mapped_row: Partial<Record<CanonicalField, string | number>> | null;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  error_count: number;
  warning_count: number;
  validation_errors: RowIssue[];
  generated_claim_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export const STATUS_LABEL: Record<ExceptionStatus, string> = {
  open: 'Open',
  corrected: 'Corrected',
  ignored: 'Ignored',
  imported: 'Imported',
};
