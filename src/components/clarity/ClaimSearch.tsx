/**
 * ClaimSearch — Phase 4B
 *
 * Global claim search bar embedded in the sidebar header.
 * Searches by: claim_id, member_id, patient name,
 * provider name, payer.  Target: < 500ms on pilot datasets.
 *
 * Results open ClaimDrawer directly.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { useAuth } from '@/hooks/use-auth';
import { ClaimDrawer } from '@/components/worklist/ClaimDrawer';
import type { OrgRole } from '@/hooks/use-org';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchResult {
  claim_id: string;
  member_id?: string;
  provider_name?: string;
  payer_name?: string;
  total_billed?: number;
  status?: string;
}

export function ClaimSearch() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.org_id ?? null;
  const userRole: OrgRole | null = currentOrg?.role ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerClaimId, setDrawerClaimId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut: Ctrl/Cmd+K.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!orgId || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      // Query claims table — payload contains all claim fields as JSONB.
      // We match against claim_id directly, then search payload JSONB for
      // member_id, provider_name, payer_name, patient_name.
      const trimmed = q.trim();

      const { data, error } = await supabase
        .from('claims')
        .select('claim_id, payload')
        .eq('org_id', orgId)
        .or(
          [
            `claim_id.ilike.%${trimmed}%`,
            `payload->>'member_id'.ilike.%${trimmed}%`,
            `payload->>'provider_name'.ilike.%${trimmed}%`,
            `payload->>'provider_npi'.ilike.%${trimmed}%`,
          ].join(','),
        )
        .limit(20);

      if (error) { console.error('[claim-search]', error.message); setResults([]); return; }

      const rows: SearchResult[] = (data ?? []).map((r: { claim_id: string; payload: Record<string, unknown> }) => {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        const payer = (p.ohi_indicators as Array<{ payer_name?: string }> | undefined)?.[0]?.payer_name ?? '';
        return {
          claim_id: r.claim_id,
          member_id: p.member_id as string | undefined,
          provider_name: p.provider_name as string | undefined,
          payer_name: payer,
          total_billed: p.total_billed as number | undefined,
          status: p.status as string | undefined,
        };
      });

      // Additional payer-name filter (can't easily do JSONB array element in the query above).
      const filtered = trimmed.length >= 2
        ? rows.filter(r =>
            r.payer_name?.toLowerCase().includes(trimmed.toLowerCase()) ||
            r.claim_id.toLowerCase().includes(trimmed.toLowerCase()) ||
            r.member_id?.toLowerCase().includes(trimmed.toLowerCase()) ||
            r.provider_name?.toLowerCase().includes(trimmed.toLowerCase()),
          )
        : rows;

      setResults(filtered);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
  };

  const fmtMoney = (cents?: number) => cents !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
    : '';

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[11px] text-sidebar-foreground/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/60 transition-colors"
      >
        <Search className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left">Search claims…</span>
        <kbd className="hidden sm:inline-flex h-4 select-none items-center gap-1 rounded border border-sidebar-border px-1 font-mono text-[9px] opacity-50">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[10vh]">
          <div ref={containerRef} className="w-full max-w-xl bg-card border rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Search by claim ID, member ID, provider, payer…"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {results.length === 0 && query.trim().length >= 2 && !loading && (
              <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No claims found.</div>
            )}

            {results.length > 0 && (
              <ul className="max-h-[400px] overflow-y-auto divide-y">
                {results.map(r => (
                  <li key={r.claim_id}>
                    <button
                      className="w-full text-left px-4 py-2.5 hover:bg-muted/60 flex items-center justify-between gap-3"
                      onClick={() => { setDrawerClaimId(r.claim_id); setOpen(false); setQuery(''); setResults([]); }}
                    >
                      <div>
                        <div className="font-mono text-[12.5px] font-semibold text-foreground">{r.claim_id}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[r.member_id, r.provider_name, r.payer_name].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {r.total_billed !== undefined && (
                          <div className="font-mono text-[12px]">{fmtMoney(r.total_billed)}</div>
                        )}
                        {r.status && (
                          <div className="text-[10px] text-muted-foreground font-mono uppercase">{r.status}</div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query.trim().length < 2 && (
              <div className="px-4 py-4 text-[11px] text-muted-foreground">
                Type at least 2 characters to search.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ClaimDrawer opened from search result */}
      {drawerClaimId && orgId && user && (
        <ClaimDrawer
          claimId={drawerClaimId}
          orgId={orgId}
          userId={user.id}
          userRole={userRole}
          onClose={() => setDrawerClaimId(null)}
        />
      )}
    </>
  );
}
