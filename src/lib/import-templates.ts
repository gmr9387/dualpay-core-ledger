/**
 * Recovery Factory — Downloadable CSV templates per source type.
 */
import type { ImportSourceType } from '@/types/import';

const TEMPLATES: Record<ImportSourceType, { headers: string[]; example: string[][] }> = {
  denial_export: {
    headers: ['Claim Number', 'Payer Name', 'Member ID', 'Service Date', 'CPT', 'CARC', 'RARC', 'Group Code', 'Denied Amount', 'Denial Message'],
    example: [
      ['CLM-2024-99001', 'Aetna',                'MEM-44021', '2024-09-12', '99214', '197', '',     'CO', '184.50', 'Precertification required.'],
      ['CLM-2024-99002', 'BlueCross BlueShield', 'MEM-44022', '2024-09-15', '73721', '50',  '',     'CO', '612.00', 'Not medically necessary per LCD.'],
      ['CLM-2024-99003', 'UnitedHealthcare',     'MEM-44023', '2024-09-18', '29881', '16',  'N657', 'CO', '1280.00','Operative report required.'],
    ],
  },
  aging_report: {
    headers: ['Claim Number', 'Payer Name', 'Submitted Date', 'Billed Amount', 'Open Balance', 'Aging Days'],
    example: [
      ['CLM-2024-88001', 'Cigna',   '2024-07-04', '925.00',  '925.00',  '120'],
      ['CLM-2024-88002', 'Medicare','2024-08-01', '1450.00', '1450.00', '95'],
    ],
  },
  underpayment_report: {
    headers: ['Claim Number', 'Payer Name', 'CPT', 'Billed Amount', 'Allowed Amount', 'Paid Amount', 'Underpayment'],
    example: [
      ['CLM-2024-77001', 'Aetna', '99215', '380.00', '210.00', '168.00', '42.00'],
      ['CLM-2024-77002', 'UHC',   '72148', '1800.00','920.00', '780.00', '140.00'],
    ],
  },
  appeal_status: {
    headers: ['Claim Number', 'Payer Name', 'Appeal Status', 'Appeal Level', 'Amount At Risk'],
    example: [
      ['CLM-2024-66001', 'Aetna', 'In Review', '1', '480.00'],
      ['CLM-2024-66002', 'UHC',   'Submitted', '2', '920.00'],
    ],
  },
  payer_followup: {
    headers: ['Claim Number', 'Payer Name', 'Aging Days', 'Open Balance'],
    example: [
      ['CLM-2024-55001', 'Cigna', '42', '512.00'],
    ],
  },
};

function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

export function downloadTemplate(source: ImportSourceType) {
  const t = TEMPLATES[source];
  const csv = toCsv(t.headers, t.example);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${source}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([k, v]) => ({ source: k as ImportSourceType, headers: v.headers }));
}
