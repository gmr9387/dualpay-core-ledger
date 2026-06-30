/**
 * Phase 3E — B-5 Recovery Cap Tests
 *
 * Verifies that logRecoveryEvent() cannot produce over-recovery by silently
 * bypassing the cap when total_billed_cents is unknown.
 *
 * All Supabase calls are mocked so these tests run without a live DB.
 *
 * Scenarios covered:
 *   1. Missing claim row (DB returns null)    → throws unknown-billed error
 *   2. total_billed_cents = 0 in DB           → throws unknown-billed error
 *   3. Valid billed amount, amount > remaining → throws cap-exceeded error
 *   4. Reversal reduces effective recovered    → subsequent recovery succeeds
 *   5. Admin allowUncappedRecovery override    → succeeds + payload flag set
 *   6. allowUncappedRecovery without admin role → throws
 *   7. allowUncappedRecovery=false, zero billed → throws (not an override)
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock Supabase BEFORE any import that transitively uses it ────────────────
vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    },
  };
});

import { logRecoveryEvent } from '../operational-workflows';
import { supabase } from '@/integrations/supabase/client';

// ── Helper: build a chainable/thenable proxy ─────────────────────────────────
/**
 * Returns a Proxy that:
 *   - resolves to `val` when awaited (it's a thenable)
 *   - returns itself for every method call (fully chainable)
 *
 * This matches the Supabase PostgREST builder pattern where any number of
 * filter methods can be chained before awaiting the result.
 *
 * Standard `vi.fn().mockReturnValue(x)` only handles a single level of
 * chaining.  Supabase queries chain an arbitrary number of filter methods
 * (e.g. .select().eq().eq().in()) before being awaited, so we need a Proxy
 * that continues returning itself at every step while still being thenable.
 */
function chain(val: unknown): ReturnType<typeof vi.fn> {
  const p = Promise.resolve(val);
  const proxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') return p.then.bind(p);
        if (prop === 'catch') return p.catch.bind(p);
        if (prop === 'finally') return p.finally.bind(p);
        return () => chain(val);
      },
    },
  );
  return proxy as ReturnType<typeof vi.fn>;
}

// ── Mock factory ─────────────────────────────────────────────────────────────
/**
 * Configure what `supabase.from(table)` returns for a single test.
 *
 * - claimsRow:   the row returned by the claims lookup (null = missing row)
 * - priorEvents: ops_events rows for the prior-recovery cap query
 * - capturePayload: when truthy, the insert mock captures the first argument
 *   so tests can assert on the event payload that was written.
 */
function setupMocks(opts: {
  claimsRow: { total_billed_cents?: number | null } | null;
  priorEvents?: Array<{ kind: string; payload: Record<string, unknown> | null }>;
  capturePayload?: { value: unknown[] };
}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    switch (table) {
      case 'claims':
        // .select('total_billed_cents').eq(...).maybeSingle()
        return {
          select: () => chain({ data: opts.claimsRow, error: null }),
        } as never;

      case 'ops_events':
        // Two distinct operation types on ops_events:
        //   select → prior-recovery cap query
        //   insert → appendOpsEvent write (only checks for error)
        return {
          select: () => chain({ data: opts.priorEvents ?? [], error: null }),
          insert: (rows: unknown[]) => {
            if (opts.capturePayload) opts.capturePayload.value = rows;
            return chain({ error: null });
          },
        } as never;

      case 'claim_assignments':
        // .update({status:'resolved'}).eq(...).eq(...)
        return {
          update: () => chain({ error: null }),
        } as never;

      default:
        return chain({ data: null, error: null }) as never;
    }
  });
}

const CLAIM_ID = 'CLM-TEST-001';
const ORG_ID   = 'org-test-uuid';

// ── Tests ────────────────────────────────────────────────────────────────────
describe('B-5 Recovery Cap — logRecoveryEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Missing claim row rejects recovery ──────────────────────────────────
  it('rejects recovery when the claim row is missing (DB returns null)', async () => {
    setupMocks({ claimsRow: null });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 10000,
        recoveredFrom: 'Payer',
      }),
    ).rejects.toThrow('Cannot log recovery: claim billed amount is unknown.');
  });

  // ── 2. Null / 0 total_billed_cents rejects recovery ───────────────────────
  it('rejects recovery when total_billed_cents is null in DB', async () => {
    setupMocks({ claimsRow: { total_billed_cents: null } });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 5000,
        recoveredFrom: 'Payer',
      }),
    ).rejects.toThrow('Cannot log recovery: claim billed amount is unknown.');
  });

  it('rejects recovery when total_billed_cents is 0 in DB', async () => {
    setupMocks({ claimsRow: { total_billed_cents: 0 } });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'adjustment',
        amountCents: 1,
        recoveredFrom: 'Payer',
      }),
    ).rejects.toThrow('Cannot log recovery: claim billed amount is unknown.');
  });

  // ── 3. Valid billed amount enforces cap ────────────────────────────────────
  it('throws when recovery amount exceeds remaining balance', async () => {
    // Billed: $100. Already recovered: $90. Remaining: $10.
    setupMocks({
      claimsRow: { total_billed_cents: 10000 },
      priorEvents: [
        { kind: 'recovery_recorded', payload: { amount_cents: 9000 } },
      ],
    });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 1500, // $15 > $10 remaining
        recoveredFrom: 'Payer',
      }),
    ).rejects.toThrow('exceeds remaining balance');
  });

  it('allows recovery that exactly fits within the remaining balance', async () => {
    // Billed: $100. Already recovered: $90. Remaining: $10.
    setupMocks({
      claimsRow: { total_billed_cents: 10000 },
      priorEvents: [
        { kind: 'recovery_recorded', payload: { amount_cents: 9000 } },
      ],
    });

    const eventId = await logRecoveryEvent(CLAIM_ID, ORG_ID, {
      recoveryType: 'payer_payment',
      amountCents: 1000, // exactly $10 — at the cap
      recoveredFrom: 'Payer',
    });

    expect(typeof eventId).toBe('string');
    expect(eventId.length).toBeGreaterThan(0);
  });

  // ── 4. Reversal-adjusted recovery still works ─────────────────────────────
  it('allows recovery after a reversal reduces effective recovered amount', async () => {
    // Billed: $100.
    // Prior: +$90 recovery, then -$50 reversal → effective = $40, remaining = $60.
    setupMocks({
      claimsRow: { total_billed_cents: 10000 },
      priorEvents: [
        { kind: 'recovery_recorded', payload: { amount_cents: 9000 } },
        { kind: 'recovery_reversed',  payload: { amount_cents: 5000 } },
      ],
    });

    const eventId = await logRecoveryEvent(CLAIM_ID, ORG_ID, {
      recoveryType: 'payer_payment',
      amountCents: 5500, // $55 ≤ $60 remaining → allowed
      recoveredFrom: 'Payer',
    });

    expect(typeof eventId).toBe('string');
    expect(eventId.length).toBeGreaterThan(0);
  });

  it('rejects recovery that exceeds reversal-adjusted remaining balance', async () => {
    // Billed: $100. Effective recovered after reversal: $40. Remaining: $60.
    setupMocks({
      claimsRow: { total_billed_cents: 10000 },
      priorEvents: [
        { kind: 'recovery_recorded', payload: { amount_cents: 9000 } },
        { kind: 'recovery_reversed',  payload: { amount_cents: 5000 } },
      ],
    });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 6100, // $61 > $60 remaining
        recoveredFrom: 'Payer',
      }),
    ).rejects.toThrow('exceeds remaining balance');
  });

  // ── 5. Admin allowUncappedRecovery override works ─────────────────────────
  it('allows recovery with no billed amount when admin sets allowUncappedRecovery=true', async () => {
    const captured = { value: [] as unknown[] };
    setupMocks({ claimsRow: null, capturePayload: captured });

    const eventId = await logRecoveryEvent(CLAIM_ID, ORG_ID, {
      recoveryType: 'adjustment',
      amountCents: 99999,
      recoveredFrom: 'Import correction',
      allowUncappedRecovery: true,
      actorRole: 'admin',
    });

    expect(typeof eventId).toBe('string');
    expect(eventId.length).toBeGreaterThan(0);

    // Payload must contain uncapped_override = true for audit trail
    const insertedRow = (captured.value as Array<Record<string, unknown>>)[0];
    const payload = insertedRow?.payload as Record<string, unknown> | null;
    expect(payload?.uncapped_override).toBe(true);
  });

  it('stamps uncapped_override=true on payload even when claim row exists with 0 billed', async () => {
    const captured = { value: [] as unknown[] };
    setupMocks({ claimsRow: { total_billed_cents: 0 }, capturePayload: captured });

    await logRecoveryEvent(CLAIM_ID, ORG_ID, {
      recoveryType: 'adjustment',
      amountCents: 5000,
      recoveredFrom: 'Import correction',
      allowUncappedRecovery: true,
      actorRole: 'admin',
    });

    const insertedRow = (captured.value as Array<Record<string, unknown>>)[0];
    const payload = insertedRow?.payload as Record<string, unknown> | null;
    expect(payload?.uncapped_override).toBe(true);
  });

  // ── 6. allowUncappedRecovery without admin role is rejected ───────────────
  it('rejects allowUncappedRecovery when actorRole is not "admin"', async () => {
    setupMocks({ claimsRow: null });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 5000,
        recoveredFrom: 'Payer',
        allowUncappedRecovery: true,
        actorRole: 'analyst',
      }),
    ).rejects.toThrow('allowUncappedRecovery requires actorRole to be "admin".');
  });

  it('rejects allowUncappedRecovery when actorRole is missing entirely', async () => {
    setupMocks({ claimsRow: null });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 5000,
        recoveredFrom: 'Payer',
        allowUncappedRecovery: true,
        // actorRole intentionally omitted
      }),
    ).rejects.toThrow('allowUncappedRecovery requires actorRole to be "admin".');
  });

  // ── 7. allowUncappedRecovery=false with zero billed is not an override ─────
  it('rejects when allowUncappedRecovery is explicitly false and billed amount is 0', async () => {
    setupMocks({ claimsRow: { total_billed_cents: 0 } });

    await expect(
      logRecoveryEvent(CLAIM_ID, ORG_ID, {
        recoveryType: 'payer_payment',
        amountCents: 1000,
        recoveredFrom: 'Payer',
        allowUncappedRecovery: false,
        actorRole: 'admin',
      }),
    ).rejects.toThrow('Cannot log recovery: claim billed amount is unknown.');
  });

  // ── Normal path: no uncapped_override on regular recovery ─────────────────
  it('does not stamp uncapped_override on a normal capped recovery', async () => {
    const captured = { value: [] as unknown[] };
    setupMocks({
      claimsRow: { total_billed_cents: 50000 },
      priorEvents: [],
      capturePayload: captured,
    });

    await logRecoveryEvent(CLAIM_ID, ORG_ID, {
      recoveryType: 'payer_payment',
      amountCents: 20000,
      recoveredFrom: 'Payer',
    });

    const insertedRow = (captured.value as Array<Record<string, unknown>>)[0];
    const payload = insertedRow?.payload as Record<string, unknown> | null;
    expect(payload?.uncapped_override).toBeUndefined();
  });
});
