/**
 * Canonical field schema + auto-detection for the Recovery Factory.
 * Deterministic: header → canonical field matching by substring rules.
 */
import type {
  CanonicalField,
  CanonicalFieldDef,
  FieldMapping,
  ImportSourceType,
} from '@/types/import';

export const CANONICAL_FIELDS: CanonicalFieldDef[] = [
  { key: 'claim_id',        label: 'Claim ID',         required: true,  kind: 'string', aliases: ['claim id', 'claim number', 'claim#', 'claim_no', 'clm', 'claim_id'] },
  { key: 'payer_name',      label: 'Payer Name',       required: true,  kind: 'string', aliases: ['payer', 'insurance', 'carrier', 'plan'] },
  { key: 'member_id',       label: 'Member ID',        required: false, kind: 'string', aliases: ['member', 'subscriber', 'patient id', 'mbr'] },
  { key: 'provider_npi',    label: 'Provider NPI',     required: false, kind: 'string', aliases: ['npi', 'rendering provider'] },
  { key: 'provider_name',   label: 'Provider Name',    required: false, kind: 'string', aliases: ['provider', 'physician', 'rendering'] },
  { key: 'service_date',    label: 'Service Date',     required: false, kind: 'date',   aliases: ['service date', 'dos', 'date of service'] },
  { key: 'submitted_date',  label: 'Submitted Date',   required: false, kind: 'date',   aliases: ['submit', 'received', 'filed'] },
  { key: 'billed_amount',   label: 'Billed Amount',    required: false, kind: 'money',  aliases: ['billed', 'charge', 'total billed'] },
  { key: 'allowed_amount',  label: 'Allowed Amount',   required: false, kind: 'money',  aliases: ['allowed'] },
  { key: 'paid_amount',     label: 'Paid Amount',      required: false, kind: 'money',  aliases: ['paid', 'reimbursed'] },
  { key: 'amount_at_risk',  label: 'Denied / At-Risk', required: true,  kind: 'money',  aliases: ['denied', 'at risk', 'underpaid', 'underpayment', 'open balance', 'balance', 'outstanding'] },
  { key: 'carc_code',       label: 'CARC',             required: true,  kind: 'string', aliases: ['carc', 'reason code', 'denial code', 'adjustment code'] },
  { key: 'rarc_code',       label: 'RARC',             required: false, kind: 'string', aliases: ['rarc', 'remark code'] },
  { key: 'group_code',      label: 'Group Code',       required: false, kind: 'string', aliases: ['group code', 'group'] },
  { key: 'denial_message',  label: 'Denial Message',   required: false, kind: 'string', aliases: ['message', 'reason desc', 'denial reason', 'narrative'] },
  { key: 'procedure_code',  label: 'CPT / HCPCS',      required: false, kind: 'string', aliases: ['cpt', 'hcpcs', 'procedure'] },
  { key: 'aging_days',      label: 'Aging Days',       required: false, kind: 'int',    aliases: ['aging', 'age', 'days outstanding'] },
  { key: 'appeal_status',   label: 'Appeal Status',    required: false, kind: 'string', aliases: ['appeal status', 'appeal state'] },
  { key: 'appeal_level',    label: 'Appeal Level',     required: false, kind: 'int',    aliases: ['appeal level', 'level'] },
];

/** Required canonical fields per source type. */
export const REQUIRED_BY_SOURCE: Record<ImportSourceType, CanonicalField[]> = {
  denial_export:        ['claim_id', 'payer_name', 'carc_code', 'amount_at_risk'],
  aging_report:         ['claim_id', 'payer_name', 'amount_at_risk'],
  underpayment_report:  ['claim_id', 'payer_name', 'amount_at_risk'],
  appeal_status:        ['claim_id', 'payer_name', 'appeal_status'],
  payer_followup:       ['claim_id', 'payer_name'],
};

export function autoDetectMapping(headers: string[]): FieldMapping {
  const m: FieldMapping = {};
  const used = new Set<string>();
  for (const def of CANONICAL_FIELDS) {
    const match = headers.find(h => {
      if (used.has(h)) return false;
      const low = h.toLowerCase().trim();
      return def.aliases.some(a => low === a || low.includes(a));
    });
    if (match) {
      m[def.key] = match;
      used.add(match);
    }
  }
  return m;
}

export function fieldDef(k: CanonicalField): CanonicalFieldDef {
  return CANONICAL_FIELDS.find(f => f.key === k)!;
}
