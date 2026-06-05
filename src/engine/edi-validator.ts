/**
 * Phase 21 — X12 Envelope Validator
 *
 * Checks structural integrity:
 *  - Required envelope segments (ISA/GS/ST/SE/GE/IEA)
 *  - Control number matching (ISA13↔IEA02, GS06↔GE02, ST02↔SE02)
 *  - Segment count balancing (SE01 = count of segments ST..SE inclusive)
 */
import type { EdiValidationIssue, EdiValidationResult, ParsedX12 } from '@/types/edi';

export function validateX12(parsed: ParsedX12): EdiValidationResult {
  const issues: EdiValidationIssue[] = [];
  const { segments } = parsed;

  const required = ['ISA', 'GS', 'ST', 'SE', 'GE', 'IEA'];
  for (const t of required) {
    if (!segments.find((s) => s.segment_type === t)) {
      issues.push({ severity: 'error', error_code: 'MISSING_SEGMENT', message: `Required segment ${t} missing` });
    }
  }

  const isa = segments.find((s) => s.segment_type === 'ISA');
  const iea = segments.find((s) => s.segment_type === 'IEA');
  if (isa && iea) {
    const a = (isa.parsed_json.ISA13 ?? '').trim();
    const b = (iea.parsed_json.IEA02 ?? '').trim();
    if (a !== b) {
      issues.push({
        severity: 'error',
        error_code: 'ISA_IEA_MISMATCH',
        message: `Interchange control numbers do not match (ISA13=${a}, IEA02=${b})`,
        segment_sequence: iea.sequence_number,
      });
    }
  }

  const gs = segments.find((s) => s.segment_type === 'GS');
  const ge = segments.find((s) => s.segment_type === 'GE');
  if (gs && ge) {
    const a = (gs.parsed_json.GS06 ?? '').trim();
    const b = (ge.parsed_json.GE02 ?? '').trim();
    if (a !== b) {
      issues.push({
        severity: 'error',
        error_code: 'GS_GE_MISMATCH',
        message: `Functional group control numbers do not match (GS06=${a}, GE02=${b})`,
        segment_sequence: ge.sequence_number,
      });
    }
  }

  const st = segments.find((s) => s.segment_type === 'ST');
  const se = segments.find((s) => s.segment_type === 'SE');
  if (st && se) {
    const a = (st.parsed_json.ST02 ?? '').trim();
    const b = (se.parsed_json.SE02 ?? '').trim();
    if (a !== b) {
      issues.push({
        severity: 'error',
        error_code: 'ST_SE_MISMATCH',
        message: `Transaction set control numbers do not match (ST02=${a}, SE02=${b})`,
        segment_sequence: se.sequence_number,
      });
    }
    const declared = parseInt(se.parsed_json.SE01 ?? '0', 10);
    const actual = se.sequence_number - st.sequence_number + 1;
    if (declared > 0 && declared !== actual) {
      issues.push({
        severity: 'warning',
        error_code: 'SE_COUNT_MISMATCH',
        message: `SE01 segment count (${declared}) does not match actual (${actual})`,
        segment_sequence: se.sequence_number,
      });
    }
  }

  if (parsed.envelope.transaction_type === 'unknown') {
    issues.push({
      severity: 'error',
      error_code: 'UNSUPPORTED_TXN',
      message: 'Transaction type is not supported (expected 835, 837P, or 837I)',
    });
  }

  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}
