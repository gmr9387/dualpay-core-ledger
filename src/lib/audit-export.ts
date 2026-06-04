/**
 * Phase 14 — Audit Export
 * Org-scoped exports of operational and audit data. Supports CSV/JSON
 * and a Redacted mode that removes member/PII identifiers and sensitive filenames.
 *
 * Reuses existing tables (no duplication). Writes ops_events for every export.
 */
import { supabase } from '@/integrations/supabase/client';
import { appendOpsEvent } from './ops-events';

export type AuditDataset =
  | 'ops_events'
  | 'escalations'
  | 'assignments'
  | 'recovery_outcomes'
  | 'evidence_actions';

export type ExportFormat = 'csv' | 'json';
export type ExportMode = 'full' | 'redacted';

export interface ExportRequest {
  dataset: AuditDataset;
  format: ExportFormat;
  mode: ExportMode;
  orgId: string;
  from?: string;
  to?: string;
}

export interface ExportResult {
  dataset: AuditDataset;
  format: ExportFormat;
  mode: ExportMode;
  rowCount: number;
  filename: string;
  blobUrl: string;
  disclaimer: string;
}

const DISCLAIMER_FULL =
  'This export may contain Protected Health Information (PHI). Treat per your BAA and HIPAA policies.';
const DISCLAIMER_REDACTED =
  'Redacted export: member identifiers, personal identifiers, and sensitive filenames removed. Suitable for vendor/regulator sharing where PHI is not permitted.';

const PII_FIELDS = new Set([
  'member_id', 'member_name', 'first_name', 'last_name', 'dob', 'ssn',
  'phone', 'email', 'address', 'address_line_1', 'address_line_2',
  'mrn', 'subscriber_id', 'patient_id',
]);
const SENSITIVE_FILE_FIELDS = new Set(['filename', 'original_filename', 'storage_path']);

function redact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (PII_FIELDS.has(k)) { out[k] = '[REDACTED]'; continue; }
    if (SENSITIVE_FILE_FIELDS.has(k)) { out[k] = '[REDACTED]'; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
  return lines.join('\n');
}

async function fetchDataset(req: ExportRequest): Promise<Record<string, unknown>[]> {
  const { dataset, orgId, from, to } = req;
  switch (dataset) {
    case 'ops_events': {
      let q = supabase.from('ops_events').select('*').eq('org_id', orgId).order('occurred_at', { ascending: false }).limit(10000);
      if (from) q = q.gte('occurred_at', from);
      if (to)   q = q.lte('occurred_at', to);
      const { data, error } = await q; if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }
    case 'escalations': {
      let q = supabase.from('ops_events').select('*').eq('org_id', orgId)
        .in('kind', ['escalation_raised', 'escalation_resolved'])
        .order('occurred_at', { ascending: false }).limit(10000);
      if (from) q = q.gte('occurred_at', from);
      if (to)   q = q.lte('occurred_at', to);
      const { data, error } = await q; if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }
    case 'assignments': {
      const { data, error } = await supabase.from('claim_assignments').select('*').eq('org_id', orgId).limit(10000);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }
    case 'recovery_outcomes': {
      let q = supabase.from('recovery_outcomes').select('*').eq('org_id', orgId).order('resolution_date', { ascending: false }).limit(10000);
      if (from) q = q.gte('resolution_date', from);
      if (to)   q = q.lte('resolution_date', to);
      const { data, error } = await q; if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }
    case 'evidence_actions': {
      let q = supabase.from('ops_events').select('*').eq('org_id', orgId)
        .in('kind', ['document_uploaded', 'document_updated', 'document_linked', 'document_removed', 'appeal_packet_generated'])
        .order('occurred_at', { ascending: false }).limit(10000);
      if (from) q = q.gte('occurred_at', from);
      if (to)   q = q.lte('occurred_at', to);
      const { data, error } = await q; if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }
  }
}

export async function runAuditExport(req: ExportRequest): Promise<ExportResult> {
  await appendOpsEvent({
    kind: 'audit_export_requested',
    summary: `Audit export requested: ${req.dataset} (${req.format}, ${req.mode})`,
    payload: { dataset: req.dataset, format: req.format, mode: req.mode, from: req.from ?? null, to: req.to ?? null },
  });

  const raw = await fetchDataset(req);
  const rows = req.mode === 'redacted' ? raw.map(r => redact(r)) : raw;

  const body = req.format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);
  const mime = req.format === 'json' ? 'application/json' : 'text/csv';
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const blobUrl = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `clarity-${req.dataset}-${req.mode}-${ts}.${req.format}`;

  await appendOpsEvent({
    kind: 'audit_export_completed',
    summary: `Audit export completed: ${req.dataset} — ${rows.length} rows (${req.mode})`,
    payload: { dataset: req.dataset, format: req.format, mode: req.mode, row_count: rows.length, filename },
  });

  return {
    dataset: req.dataset, format: req.format, mode: req.mode,
    rowCount: rows.length, filename, blobUrl,
    disclaimer: req.mode === 'redacted' ? DISCLAIMER_REDACTED : DISCLAIMER_FULL,
  };
}

export function downloadResult(r: ExportResult) {
  const a = document.createElement('a');
  a.href = r.blobUrl; a.download = r.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(r.blobUrl), 1000);
}
