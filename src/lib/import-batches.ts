/**
 * Recovery Factory — Import batch persistence (Lovable Cloud).
 */
import { supabase } from '@/integrations/supabase/client';
import type { ImportBatch, ImportSourceType, FieldMapping, ValidationSummary, ParsedRow } from '@/types/import';
import { rowToClaim } from '@/engine/import-to-claim';
import { saveClaim } from '@/data/repository';
import { persistExceptions } from '@/lib/import-exceptions';
import { persistRemittanceBatch } from '@/lib/remittance-batches';

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
const J = <T>(v: T) => v as unknown as Json;

const EVENT = 'clarity-import-batches';

function fromRow(r: any): ImportBatch {
  return {
    batch_id: r.batch_id,
    file_name: r.file_name,
    source_type: r.source_type,
    uploaded_by: r.uploaded_by,
    status: r.status,
    record_count: r.record_count,
    success_count: r.success_count,
    error_count: r.error_count,
    warning_count: r.warning_count,
    import_score: r.import_score,
    mapping: (r.mapping ?? {}) as FieldMapping,
    validation: (r.validation ?? {}) as ValidationSummary,
    generated_claim_ids: (r.generated_claim_ids ?? []) as string[],
    expected_recovery_cents: Number(r.expected_recovery_cents ?? 0),
    uploaded_at: r.uploaded_at,
    committed_at: r.committed_at,
  };
}

export async function listBatches(): Promise<ImportBatch[]> {
  const { data, error } = await (supabase as any)
    .from('import_batches')
    .select('*')
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createBatch(args: {
  file_name: string;
  source_type: ImportSourceType;
  mapping: FieldMapping;
  validation: ValidationSummary;
}): Promise<ImportBatch> {
  const payload = {
    file_name: args.file_name,
    source_type: args.source_type,
    status: 'validated',
    record_count: args.validation.total,
    success_count: args.validation.ok,
    error_count: args.validation.error,
    warning_count: args.validation.warning,
    import_score: args.validation.import_score,
    mapping: J(args.mapping),
    validation: J(args.validation),
  };
  const { data, error } = await (supabase as any)
    .from('import_batches')
    .insert([payload])
    .select('*')
    .single();
  if (error) throw error;
  window.dispatchEvent(new Event(EVENT));
  return fromRow(data);
}

export async function commitBatch(
  batch: ImportBatch,
  rows: ParsedRow[],
  source: ImportSourceType,
): Promise<{ committed: number; expected_recovery_cents: number; claim_ids: string[] }> {
  let expected = 0;
  const claim_ids: string[] = [];
  for (const r of rows) {
    if (r.status === 'error') continue;
    try {
      const { claim, expectedRecoveryCents } = rowToClaim(r, source, batch.batch_id);
      await saveClaim(claim);
      claim_ids.push(claim.claim_id);
      expected += expectedRecoveryCents;
    } catch {
      // skip row on conversion failure
    }
  }

  // Phase 9 — preserve every failed/warning row as an exception (no data loss).
  try {
    await persistExceptions(batch, rows);
  } catch (e) {
    console.error('[import-batches] persistExceptions failed', e);
  }

  const { error } = await (supabase as any)
    .from('import_batches')
    .update({
      status: 'committed',
      success_count: claim_ids.length,
      generated_claim_ids: J(claim_ids),
      expected_recovery_cents: expected,
      committed_at: new Date().toISOString(),
    })
    .eq('batch_id', batch.batch_id);
  if (error) throw error;
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event('clarity-claims-changed'));
  return { committed: claim_ids.length, expected_recovery_cents: expected, claim_ids };
}

export const IMPORT_BATCH_EVENT = EVENT;
