/**
 * Regression tests — Assignment Unassign Defect remediation.
 *
 * Guarantees:
 *  - `assign(userId)`   persists the user id verbatim
 *  - `unassign()` / `assign(null | undefined | '')` all persist `assignee = NULL`
 *    (never `undefined`) via a single, standardized code path
 *  - reassigning to a different user replaces the previous assignee cleanly
 *  - `normalizeAssignee` collapses all "empty" inputs to `null`
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// -----------------------------
// In-memory supabase mock
// -----------------------------
type Row = { claim_id: string; assignee: string | null; status: string; updated_at: string };
const table = new Map<string, Row>();
const upsertSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const from = (_t: string) => ({
    select: (_c?: string) => ({
      // loadAllAssignments path
      then: (resolve: (v: { data: Row[]; error: null }) => void) =>
        resolve({ data: Array.from(table.values()), error: null }),
    }),
    upsert: (row: Row, _opts: unknown) => {
      upsertSpy(row);
      table.set(row.claim_id, { ...row });
      return {
        select: (_c?: string) => ({
          single: async () => ({ data: table.get(row.claim_id)!, error: null }),
        }),
      };
    },
  });
  return { supabase: { from } };
});

import {
  setAssignment,
  unassignClaim,
  normalizeAssignee,
  _setCache,
  UNASSIGNED,
} from '@/lib/assignments';

const CLAIM = 'CLM-UNASSIGN-001';
const USER_A = 'user-aaaa-1111';
const USER_B = 'user-bbbb-2222';

beforeEach(() => {
  table.clear();
  upsertSpy.mockClear();
  _setCache({});
});

describe('normalizeAssignee', () => {
  it('returns null for null / undefined / empty / whitespace', () => {
    expect(normalizeAssignee(null)).toBeNull();
    expect(normalizeAssignee(undefined)).toBeNull();
    expect(normalizeAssignee('')).toBeNull();
    expect(normalizeAssignee('   ')).toBeNull();
  });
  it('preserves and trims real user ids', () => {
    expect(normalizeAssignee(USER_A)).toBe(USER_A);
    expect(normalizeAssignee(`  ${USER_A}  `)).toBe(USER_A);
  });
  it('UNASSIGNED sentinel is null (never undefined)', () => {
    expect(UNASSIGNED).toBeNull();
  });
});

describe('assign / unassign / reassign — persistence contract', () => {
  it('assign persists the user id', async () => {
    const res = await setAssignment(CLAIM, { assignee: USER_A });
    expect(res?.assignee).toBe(USER_A);
    expect(upsertSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ claim_id: CLAIM, assignee: USER_A }),
    );
  });

  it('unassignClaim() persists assignee = NULL (not undefined)', async () => {
    await setAssignment(CLAIM, { assignee: USER_A });
    const res = await unassignClaim(CLAIM);
    expect(res?.assignee).toBeNull();
    const lastRow = upsertSpy.mock.calls.at(-1)![0] as Row;
    expect(lastRow.assignee).toBeNull();
    expect(lastRow.assignee).not.toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(lastRow, 'assignee')).toBe(true);
  });

  it('assign(null) is equivalent to unassign', async () => {
    await setAssignment(CLAIM, { assignee: USER_A });
    const res = await setAssignment(CLAIM, { assignee: null });
    expect(res?.assignee).toBeNull();
    expect((upsertSpy.mock.calls.at(-1)![0] as Row).assignee).toBeNull();
  });

  it("assign('') and assign('   ') both normalize to NULL", async () => {
    await setAssignment(CLAIM, { assignee: USER_A });
    await setAssignment(CLAIM, { assignee: '' });
    expect((upsertSpy.mock.calls.at(-1)![0] as Row).assignee).toBeNull();

    await setAssignment(CLAIM, { assignee: USER_A });
    await setAssignment(CLAIM, { assignee: '   ' });
    expect((upsertSpy.mock.calls.at(-1)![0] as Row).assignee).toBeNull();
  });

  it('assignee=undefined patch is a no-op (backward compat: preserves current)', async () => {
    await setAssignment(CLAIM, { assignee: USER_A });
    const res = await setAssignment(CLAIM, { status: 'in_progress' });
    expect(res?.assignee).toBe(USER_A);
    expect(res?.status).toBe('in_progress');
  });

  it('reassign replaces previous user cleanly', async () => {
    await setAssignment(CLAIM, { assignee: USER_A });
    const res = await setAssignment(CLAIM, { assignee: USER_B });
    expect(res?.assignee).toBe(USER_B);
    expect(table.get(CLAIM)?.assignee).toBe(USER_B);
  });

  it('full lifecycle: assign → unassign → reassign', async () => {
    const a = await setAssignment(CLAIM, { assignee: USER_A });
    expect(a?.assignee).toBe(USER_A);

    const u = await unassignClaim(CLAIM);
    expect(u?.assignee).toBeNull();

    const r = await setAssignment(CLAIM, { assignee: USER_B });
    expect(r?.assignee).toBe(USER_B);

    // Every persisted row carried an explicit assignee key (null or string, never undefined).
    for (const call of upsertSpy.mock.calls) {
      const row = call[0] as Row;
      expect(Object.prototype.hasOwnProperty.call(row, 'assignee')).toBe(true);
      expect(row.assignee === null || typeof row.assignee === 'string').toBe(true);
    }
  });
});
