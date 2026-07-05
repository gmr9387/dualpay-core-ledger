import { supabase } from '@/integrations/supabase/client';
import { appendOpsEvent } from './ops-events';
import type { EvidenceDocument, DocumentType } from '@/types/evidence';

const BUCKET = 'evidence-documents';
const PACKET_BUCKET = 'appeal-packets';

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function listEvidenceDocuments(filter?: {
  claim_id?: string;
  denial_id?: string;
  document_type?: DocumentType;
  search?: string;
}): Promise<EvidenceDocument[]> {
  let q = supabase.from('evidence_documents').select('*').order('uploaded_at', { ascending: false });
  if (filter?.claim_id) q = q.eq('claim_id', filter.claim_id);
  if (filter?.denial_id) q = q.eq('denial_id', filter.denial_id);
  if (filter?.document_type) q = q.eq('document_type', filter.document_type);
  if (filter?.search) q = q.ilike('filename', `%${filter.search}%`);
  const { data, error } = await q.limit(500);
  if (error) {
    console.error('[evidence] list failed', error.message);
    return [];
  }
  return (data ?? []) as EvidenceDocument[];
}

export async function getEvidenceDocument(id: string): Promise<EvidenceDocument | null> {
  const { data, error } = await supabase.from('evidence_documents').select('*').eq('document_id', id).single();
  if (error) { console.error('[evidence] get failed', error.message); return null; }
  return data as EvidenceDocument;
}

export async function getSignedUrl(doc: EvidenceDocument, expiresIn = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, expiresIn);
  if (error) { console.error('[evidence] sign failed', error.message); return null; }
  return data?.signedUrl ?? null;
}

export interface UploadInput {
  file: File;
  org_id: string;
  claim_id?: string | null;
  denial_id?: string | null;
  document_type: DocumentType;
  notes?: string;
  parent_document_id?: string | null;
}

export async function uploadEvidenceDocument(input: UploadInput): Promise<EvidenceDocument | null> {
  const { file, org_id, claim_id, denial_id, document_type, notes, parent_document_id } = input;

  // Determine version: if a parent is supplied, use parent's version + 1;
  // otherwise look up prior versions for the same (claim_id, document_type, filename root).
  let version = 1;
  let parent = parent_document_id ?? null;
  if (parent_document_id) {
    const p = await getEvidenceDocument(parent_document_id);
    if (p) version = (p.version ?? 1) + 1;
  } else if (claim_id) {
    const { data: prior } = await supabase
      .from('evidence_documents')
      .select('document_id, version')
      .eq('claim_id', claim_id)
      .eq('document_type', document_type)
      .ilike('filename', file.name)
      .order('version', { ascending: false })
      .limit(1);
    if (prior && prior.length > 0) {
      version = (prior[0].version ?? 1) + 1;
      parent = prior[0].document_id as string;
    }
  }

  const docId = crypto.randomUUID();
  const path = `${org_id}/${claim_id ?? 'unlinked'}/${docId}_v${version}_${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    console.error('[evidence] upload failed', upErr.message);
    return null;
  }

  const { data: userResp } = await supabase.auth.getUser();
  const user = userResp?.user;

  const row = {
    document_id: docId,
    org_id,
    claim_id: claim_id ?? null,
    denial_id: denial_id ?? null,
    storage_bucket: BUCKET,
    storage_path: path,
    filename: file.name,
    mime_type: file.type,
    file_size: file.size,
    document_type,
    version,
    parent_document_id: parent,
    uploaded_by: user?.id ?? null,
    uploaded_by_email: user?.email ?? null,
    notes: notes ?? null,
  };

  const { data, error } = await supabase.from('evidence_documents').insert([row]).select('*').single();
  if (error) {
    console.error('[evidence] db insert failed', error.message);
    await supabase.storage.from(BUCKET).remove([path]);
    return null;
  }

  await appendOpsEvent({
    kind: 'document_uploaded' as never,
    claim_id: claim_id ?? null,
    summary: `Uploaded ${document_type} "${file.name}" (v${version})`,
    payload: { document_id: docId, document_type, version, denial_id: denial_id ?? null },
  });

  window.dispatchEvent(new Event('clarity-evidence-changed'));
  return data as EvidenceDocument;
}

export async function deleteEvidenceDocument(id: string): Promise<boolean> {
  const doc = await getEvidenceDocument(id);
  if (!doc) return false;
  const { error: sErr } = await supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]);
  if (sErr) console.warn('[evidence] storage remove failed', sErr.message);
  const { error } = await supabase.from('evidence_documents').delete().eq('document_id', id);
  if (error) { console.error('[evidence] delete failed', error.message); return false; }
  await appendOpsEvent({
    kind: 'document_removed' as never,
    claim_id: doc.claim_id,
    summary: `Removed ${doc.document_type} "${doc.filename}" (v${doc.version})`,
    payload: { document_id: id },
  });
  window.dispatchEvent(new Event('clarity-evidence-changed'));
  return true;
}

export async function linkEvidenceToDenial(id: string, denial_id: string | null): Promise<boolean> {
  const { error } = await supabase.from('evidence_documents').update({ denial_id }).eq('document_id', id);
  if (error) { console.error('[evidence] link failed', error.message); return false; }
  await appendOpsEvent({
    kind: 'document_linked' as never,
    summary: `Linked document to denial ${denial_id ?? '(none)'}`,
    payload: { document_id: id, denial_id },
  });
  window.dispatchEvent(new Event('clarity-evidence-changed'));
  return true;
}

export async function uploadAppealPacket(opts: {
  org_id: string;
  claim_id: string;
  filename: string;
  content: Blob;
  contentType?: string;
}): Promise<{ path: string; signedUrl: string | null } | null> {
  const path = `${opts.org_id}/${opts.claim_id}/${Date.now()}_${safeName(opts.filename)}`;
  const { error } = await supabase.storage.from(PACKET_BUCKET).upload(path, opts.content, {
    contentType: opts.contentType ?? 'text/html',
    upsert: false,
  });
  if (error) { console.error('[packet] upload failed', error.message); return null; }
  const { data } = await supabase.storage.from(PACKET_BUCKET).createSignedUrl(path, 600);
  return { path, signedUrl: data?.signedUrl ?? null };
}
