/**
 * Persistence layer (Lovable Cloud / Postgres).
 *
 * Hydrates the in-memory engine inputs from the database, persists
 * new adjudication runs / traces / case events, and seeds demo data
 * on first run if the DB is empty.
 *
 * Engine code (calculation-engine, cob-rules, case-management) is
 * intentionally pure and unaware of persistence. This module is the
 * only bridge between the engine and the database.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  Claim,
  AdjudicationRun,
  MemberAccumulators,
} from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import type { Case, CaseEvent } from '@/types/case';
import {
  demoCases,
  demoCaseEvents,
} from './demo-scenarios';
import {
  clarityClaims,
  clarityAccumulators,
} from './clarity-scenarios';

// ── Loaders ───────────────────────────────────────────────────

export async function loadClaims(): Promise<Claim[]> {
  const { data, error } = await supabase
    .from('claims')
    .select('payload')
    .order('service_date_from', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.payload as unknown as Claim);
}

export async function loadCases(): Promise<Case[]> {
  const { data: cases, error: e1 } = await supabase
    .from('cases')
    .select('case_id, member_id, status, description, tags, created_at');
  if (e1) throw e1;

  const { data: links, error: e2 } = await supabase
    .from('case_claim_links')
    .select('case_id, claim_id');
  if (e2) throw e2;

  const linksByCase = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = linksByCase.get(l.case_id) ?? [];
    arr.push(l.claim_id);
    linksByCase.set(l.case_id, arr);
  }

  return (cases ?? []).map((c) => ({
    case_id: c.case_id,
    member_id: c.member_id,
    status: c.status as Case['status'],
    description: c.description ?? '',
    tags: c.tags ?? [],
    created_at: c.created_at,
    claim_ids: linksByCase.get(c.case_id) ?? [],
  }));
}

export async function loadCaseEvents(): Promise<CaseEvent[]> {
  const { data, error } = await supabase
    .from('case_events')
    .select('event_id, case_id, claim_id, event_type, description, metadata, occurred_at')
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    event_id: e.event_id,
    case_id: e.case_id,
    claim_id: e.claim_id ?? undefined,
    event_type: e.event_type as CaseEvent['event_type'],
    description: e.description,
    metadata: (e.metadata ?? undefined) as Record<string, unknown> | undefined,
    timestamp: e.occurred_at,
  }));
}

export async function loadAccumulators(): Promise<Record<string, MemberAccumulators>> {
  const { data, error } = await supabase
    .from('member_accumulators')
    .select('payload');
  if (error) throw error;
  const out: Record<string, MemberAccumulators> = {};
  for (const row of data ?? []) {
    const acc = row.payload as unknown as MemberAccumulators;
    if (acc?.member_id) out[acc.member_id] = acc;
  }
  return out;
}

export interface PersistedRun {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

export async function loadLatestRuns(): Promise<PersistedRun[]> {
  const { data: runs, error } = await supabase
    .from('adjudication_runs')
    .select('run_id, claim_id, payload, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Pick the latest run per claim
  const latestByClaim = new Map<string, { run_id: string; claim_id: string; payload: unknown }>();
  for (const r of runs ?? []) {
    if (!latestByClaim.has(r.claim_id)) {
      latestByClaim.set(r.claim_id, r);
    }
  }

  const runIds = Array.from(latestByClaim.values()).map((r) => r.run_id);
  if (runIds.length === 0) return [];

  const { data: traces, error: tErr } = await supabase
    .from('traces')
    .select('run_id, payload')
    .in('run_id', runIds);
  if (tErr) throw tErr;

  const traceByRun = new Map<string, TraceObject>();
  for (const t of traces ?? []) {
    traceByRun.set(t.run_id, t.payload as unknown as TraceObject);
  }

  const out: PersistedRun[] = [];
  for (const r of latestByClaim.values()) {
    const trace = traceByRun.get(r.run_id);
    if (!trace) continue;
    out.push({
      claimId: r.claim_id,
      run: r.payload as unknown as AdjudicationRun,
      trace,
    });
  }
  return out;
}

// ── Writers ───────────────────────────────────────────────────

// Helper: cast our domain objects to the Json type expected by the
// generated Supabase types without losing structural info.
type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];
const asJson = <T>(v: T): Json => v as unknown as Json;

export async function saveClaim(claim: Claim): Promise<void> {
  const { error } = await supabase.from('claims').upsert([{
    claim_id: claim.claim_id,
    member_id: claim.member_id,
    provider_name: claim.provider_name ?? undefined,
    service_date_from: claim.service_date_from,
    service_date_to: claim.service_date_to ?? claim.service_date_from,
    status: claim.status,
    total_billed_cents: claim.total_billed,
    payload: asJson(claim),
  }]);
  if (error) throw error;
}

export async function saveAdjudication(
  claimId: string,
  run: AdjudicationRun,
  trace: TraceObject,
  isRetro = false,
): Promise<void> {
  const { error: runErr } = await supabase.from('adjudication_runs').upsert([{
    run_id: run.run_id,
    claim_id: claimId,
    total_plan_paid_cents: run.total_plan_paid,
    total_member_responsibility_cents: run.total_member_responsibility,
    is_retro: isRetro,
    payload: asJson(run),
  }]);
  if (runErr) throw runErr;

  const { error: traceErr } = await supabase.from('traces').upsert([{
    trace_id: trace.trace_id,
    run_id: run.run_id,
    claim_id: claimId,
    payload: asJson(trace),
  }]);
  if (traceErr) throw traceErr;
}

export async function saveAccumulators(acc: MemberAccumulators): Promise<void> {
  const { error } = await supabase.from('member_accumulators').upsert([{
    member_id: acc.member_id,
    plan_year: acc.plan_year,
    individual_deductible_used_cents: acc.individual_deductible_used,
    individual_oop_used_cents: acc.individual_oop_used,
    family_deductible_used_cents: acc.family_deductible_used,
    family_oop_used_cents: acc.family_oop_used,
    payload: asJson(acc),
  }]);
  if (error) throw error;
}

export async function saveCase(c: Case): Promise<void> {
  const { error: cErr } = await supabase.from('cases').upsert([{
    case_id: c.case_id,
    member_id: c.member_id,
    status: c.status,
    description: c.description,
    tags: c.tags,
  }]);
  if (cErr) throw cErr;

  // Replace links
  await supabase.from('case_claim_links').delete().eq('case_id', c.case_id);
  if (c.claim_ids.length > 0) {
    const { error: lErr } = await supabase.from('case_claim_links').insert(
      c.claim_ids.map((claim_id) => ({ case_id: c.case_id, claim_id })),
    );
    if (lErr) throw lErr;
  }
}

export async function saveCaseEvent(evt: CaseEvent): Promise<void> {
  const { error } = await supabase.from('case_events').upsert([{
    event_id: evt.event_id,
    case_id: evt.case_id,
    claim_id: evt.claim_id ?? undefined,
    event_type: evt.event_type,
    description: evt.description,
    metadata: evt.metadata ? asJson(evt.metadata) : undefined,
    occurred_at: evt.timestamp,
  }]);
  if (error) throw error;
}

// ── Seed ──────────────────────────────────────────────────────

export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const { count, error } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return { seeded: false };

  // Claims (Claim Clarity rich dataset — 28 claims with intel envelopes)
  for (const c of clarityClaims) await saveClaim(c);

  // Accumulators
  for (const acc of Object.values(clarityAccumulators)) await saveAccumulators(acc);

  // Cases (+ links) and events (legacy DualPay demo cases — kept for case management module)
  for (const cs of demoCases) await saveCase(cs);
  for (const evt of demoCaseEvents) await saveCaseEvent(evt);

  return { seeded: true };
}
