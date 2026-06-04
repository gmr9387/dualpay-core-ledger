/**
 * Evidence Vault types.
 */
export const DOCUMENT_TYPES = [
  'Medical Record',
  'Authorization',
  'Referral',
  'Appeal Letter',
  'Clinical Note',
  'EOB',
  'Remittance',
  'Contract',
  'Payer Correspondence',
  'Supporting Documentation',
  'Other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface EvidenceDocument {
  document_id: string;
  org_id: string | null;
  claim_id: string | null;
  denial_id: string | null;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  file_size: number;
  document_type: DocumentType;
  version: number;
  parent_document_id: string | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string;
  notes: string | null;
}

export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

export function isSupportedMime(m: string): boolean {
  return m in SUPPORTED_MIME_TYPES;
}
