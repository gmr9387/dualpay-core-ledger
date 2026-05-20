/**
 * Claim Clarity data hooks.
 * Loads claims (with embedded intel) from persistence and exposes
 * derived views for the operational modules.
 */
import { useQuery } from '@tanstack/react-query';
import { loadClaims, seedIfEmpty } from '@/data/repository';
import type { Claim } from '@/types/claim';
import type { ClaimIntel, WorkQueueId, DenialEvent } from '@/types/clarity';

export interface ClarityClaim extends Claim {
  intel: ClaimIntel; // narrowed to required
}

export function useClarityData() {
  return useQuery({
    queryKey: ['clarity-claims'],
    queryFn: async () => {
      await seedIfEmpty();
      const claims = await loadClaims();
      return claims.filter((c): c is ClarityClaim => !!c.intel);
    },
    staleTime: 60_000,
  });
}

export function selectByQueue(claims: ClarityClaim[], queue: WorkQueueId): ClarityClaim[] {
  return claims.filter(c => c.intel.queues.includes(queue));
}

export function allDenials(claims: ClarityClaim[]): { claim: ClarityClaim; denial: DenialEvent }[] {
  const out: { claim: ClarityClaim; denial: DenialEvent }[] = [];
  for (const c of claims) {
    for (const d of c.intel.denial_events) out.push({ claim: c, denial: d });
  }
  return out;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCentsCompact(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function slaStatus(due: string): { label: string; tone: 'ok' | 'warn' | 'breach' } {
  const ms = new Date(due).getTime() - Date.now();
  const hours = ms / 3_600_000;
  if (hours < 0) return { label: `${Math.abs(Math.round(hours / 24))}d overdue`, tone: 'breach' };
  if (hours < 48) return { label: `${Math.round(hours)}h left`, tone: 'warn' };
  const days = Math.round(hours / 24);
  return { label: `${days}d left`, tone: 'ok' };
}
