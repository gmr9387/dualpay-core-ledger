/**
 * Phase 10 — Remittance Normalizer
 *
 * Converts validated ParsedRows (from 835-derived CSVs, EOB exports,
 * payer remittance reports, or remittance spreadsheets) into a canonical
 * `CanonicalRemittance` shape. No raw EDI parsing yet — only structured
 * tabular exports. Purely deterministic, no AI.
 */
import type {
  CanonicalField,
  CanonicalRemittance,
  ParsedRow,
} from '@/types/import';

function s(row: ParsedRow, k: CanonicalField): string | undefined {
  const v = row.normalized[k];
  return v === undefined || v === '' ? undefined : String(v);
}
function n(row: ParsedRow, k: CanonicalField): number {
  const v = row.normalized[k];
  return typeof v === 'number' ? v : 0;
}

const GROUP_CODES: ReadonlyArray<NonNullable<CanonicalRemittance['group_code']>> =
  ['CO', 'PR', 'OA', 'PI', 'CR'];

function normalizeGroupCode(v?: string): CanonicalRemittance['group_code'] {
  if (!v) return undefined;
  const up = v.trim().toUpperCase() as NonNullable<CanonicalRemittance['group_code']>;
  return GROUP_CODES.includes(up) ? up : undefined;
}

export function normalizeRemittance(row: ParsedRow): CanonicalRemittance {
  const billed   = n(row, 'billed_amount');
  const allowed  = n(row, 'allowed_amount');
  const paid     = n(row, 'paid_amount');
  const ptResp   = n(row, 'patient_responsibility');
  const adjustment = n(row, 'adjustment_amount')
    || Math.max(0, billed - paid - ptResp);

  return {
    claim_id:     s(row, 'claim_id') ?? '',
    payer_name:   s(row, 'payer_name') ?? 'Unknown Payer',
    service_date: s(row, 'service_date'),
    remittance_date: s(row, 'remittance_date'),
    payment_reference: s(row, 'payment_reference'),
    check_number: s(row, 'check_number'),
    billed_cents: billed,
    allowed_cents: allowed,
    paid_cents: paid,
    patient_resp_cents: ptResp,
    adjustment_cents: adjustment,
    carc_code: s(row, 'carc_code'),
    rarc_code: s(row, 'rarc_code'),
    group_code: normalizeGroupCode(s(row, 'group_code')),
    denial_reason: s(row, 'denial_message'),
    procedure_code: s(row, 'procedure_code'),
    member_id: s(row, 'member_id'),
    provider_npi: s(row, 'provider_npi'),
    provider_name: s(row, 'provider_name'),
  };
}

export function normalizeRemittanceBatch(rows: ParsedRow[]): CanonicalRemittance[] {
  return rows
    .filter(r => r.status !== 'error')
    .map(normalizeRemittance);
}
