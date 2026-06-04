/**
 * Phase 15 — Contract Import Engine
 * Parses CSV fee schedule files into validated rows ready for fee_schedules insert.
 * Expected columns (case-insensitive): procedure_code, modifier, contracted_amount, reimbursement_method
 * Amount may be in dollars (e.g. "125.00") or cents.
 */
import type { ReimbursementMethod } from '@/types/contracts';

const VALID_METHODS: ReimbursementMethod[] = [
  'fixed_fee', 'percent_of_medicare', 'percent_of_billed', 'case_rate', 'per_diem',
];

export interface ParsedFeeRow {
  procedure_code: string;
  modifier?: string | null;
  contracted_amount_cents: number;
  reimbursement_method: ReimbursementMethod;
}

export interface ContractImportResult {
  rows: ParsedFeeRow[];
  errors: { line: number; reason: string }[];
}

function detectAmountCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  // Heuristic: if contains decimal point, treat as dollars.
  if (cleaned.includes('.')) return Math.round(n * 100);
  // If integer and >= 1000, assume already cents.
  if (n >= 1000) return n;
  return Math.round(n * 100);
}

function normalizeMethod(raw: string): ReimbursementMethod {
  const k = raw.toLowerCase().replace(/[^a-z]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (VALID_METHODS.includes(k as ReimbursementMethod)) return k as ReimbursementMethod;
  if (k.includes('medicare')) return 'percent_of_medicare';
  if (k.includes('billed') || k.includes('charge')) return 'percent_of_billed';
  if (k.includes('case')) return 'case_rate';
  if (k.includes('diem') || k.includes('per_day')) return 'per_diem';
  return 'fixed_fee';
}

export function parseFeeScheduleCsv(text: string): ContractImportResult {
  const rows: ParsedFeeRow[] = [];
  const errors: ContractImportResult['errors'] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return { rows, errors: [{ line: 0, reason: 'File appears empty' }] };

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = {
    code: header.findIndex(h => h.includes('proc') || h === 'cpt' || h === 'hcpcs' || h === 'code'),
    mod:  header.findIndex(h => h.includes('mod')),
    amt:  header.findIndex(h => h.includes('amount') || h.includes('rate') || h.includes('fee')),
    meth: header.findIndex(h => h.includes('method') || h.includes('reimburs')),
  };
  if (idx.code < 0 || idx.amt < 0) {
    return { rows, errors: [{ line: 0, reason: 'Missing required columns: procedure_code, contracted_amount' }] };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const code = cols[idx.code];
    if (!code) { errors.push({ line: i + 1, reason: 'missing procedure_code' }); continue; }
    const cents = detectAmountCents(cols[idx.amt] ?? '');
    if (cents <= 0) { errors.push({ line: i + 1, reason: 'invalid amount' }); continue; }
    rows.push({
      procedure_code: code.toUpperCase(),
      modifier: idx.mod >= 0 ? (cols[idx.mod] || null) : null,
      contracted_amount_cents: cents,
      reimbursement_method: idx.meth >= 0 ? normalizeMethod(cols[idx.meth] ?? '') : 'fixed_fee',
    });
  }
  return { rows, errors };
}
