import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listEvidenceDocuments } from '@/lib/evidence-documents';
import type { DocumentType } from '@/types/evidence';

export function useEvidenceDocuments(filter?: {
  claim_id?: string;
  denial_id?: string;
  document_type?: DocumentType;
  search?: string;
}) {
  const qc = useQueryClient();
  const key = ['evidence-documents', filter ?? {}];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listEvidenceDocuments(filter),
    staleTime: 30_000,
  });
  useEffect(() => {
    const h = () => qc.invalidateQueries({ queryKey: ['evidence-documents'] });
    window.addEventListener('clarity-evidence-changed', h);
    return () => window.removeEventListener('clarity-evidence-changed', h);
  }, [qc]);
  return query;
}
