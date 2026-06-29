import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock persistence layer — replay-store tests are unit tests for the
// in-memory cache; no live Supabase connection should be required.
vi.mock('@/data/repository', () => ({
  saveReplayRecordPersistent: vi.fn().mockResolvedValue(undefined),
  listReplayRecordsPersistent: vi.fn().mockResolvedValue([]),
}));

import {
  saveReplayRecord,
  getReplayRecord,
  getReplayRecordByFingerprint,
  getReplayRecordByRunId,
  hasFingerprint,
  hasRunId,
  listReplayRecords,
  clearReplayStore,
  verifyReplayStoreIntegrity,
} from '@/engine/replay-store';
import type { ReplayRecord } from '@/engine/replay-store';

// Test fixtures
let __seq = 0;
function makeReplayRecord(overrides: Partial<ReplayRecord> = {}): ReplayRecord {
  const id = `${Date.now()}_${++__seq}`;
  const snapshot = {
    snapshot_id: `snap_${id}`,
    claim_id: 'CLM-001',
    created_at: new Date().toISOString(),
    calc_policy_version: '1.0.0',
    rule_set_version: '1.0.0',
    cob_rule_version: '1.0.0',
    claim: {} as never,
    accumulators: {} as never,
    contract: {} as never,
    plan: {} as never,
    prior_outcomes: [],
  } as unknown as ReplayRecord['snapshot'];
  const run = {
    run_id: `run_${id}`,
    claim_id: 'CLM-001',
    timestamp: new Date().toISOString(),
    line_processing_order: [],
    line_results: [],
    final_accumulator: {} as never,
    total_plan_paid: 10000,
    total_member_responsibility: 5000,
    trace_id: `trace_${id}`,
    calc_policy_version: '1.0.0',
  } as unknown as ReplayRecord['run'];
  return {
    snapshot,
    run,
    fingerprint: `fp_${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Replay Store — Persistence', () => {
  beforeEach(() => {
    clearReplayStore();
  });

  afterEach(() => {
    clearReplayStore();
  });

  describe('Save and Load', () => {
    it('saves a replay record to cache', async () => {
      const record = makeReplayRecord();
      await saveReplayRecord(record);
      
      const loaded = getReplayRecord(record.snapshot.snapshot_id);
      expect(loaded).toBeTruthy();
      expect(loaded?.fingerprint).toBe(record.fingerprint);
    });

    it('retrieves record by fingerprint', async () => {
      const record = makeReplayRecord();
      await saveReplayRecord(record);
      
      const loaded = getReplayRecordByFingerprint(record.fingerprint);
      expect(loaded).toBeTruthy();
      expect(loaded?.snapshot.snapshot_id).toBe(record.snapshot.snapshot_id);
    });

    it('retrieves record by run_id', async () => {
      const record = makeReplayRecord();
      await saveReplayRecord(record);
      
      const loaded = getReplayRecordByRunId(record.run.run_id);
      expect(loaded).toBeTruthy();
      expect(loaded?.snapshot.snapshot_id).toBe(record.snapshot.snapshot_id);
    });

    it('lists all records newest first', async () => {
      const record1 = makeReplayRecord({ created_at: '2024-01-01T00:00:00Z' });
      const record2 = makeReplayRecord({ created_at: '2024-01-02T00:00:00Z' });
      
      await saveReplayRecord(record1);
      await saveReplayRecord(record2);
      
      const list = listReplayRecords();
      expect(list).toHaveLength(2);
      expect(list[0].created_at).toBe('2024-01-02T00:00:00Z');
      expect(list[1].created_at).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('Uniqueness Constraints', () => {
    it('rejects duplicate snapshot_id', async () => {
      const record1 = makeReplayRecord();
      const record2 = makeReplayRecord({
        snapshot: record1.snapshot,
      });
      
      await saveReplayRecord(record1);
      
      await expect(saveReplayRecord(record2)).rejects.toThrow(
        `Replay record already exists for snapshot ${record1.snapshot.snapshot_id}`,
      );
    });

    it('rejects duplicate fingerprint', async () => {
      const record1 = makeReplayRecord({ fingerprint: 'fp_same' });
      const record2 = makeReplayRecord({ fingerprint: 'fp_same' });
      
      await saveReplayRecord(record1);
      
      await expect(saveReplayRecord(record2)).rejects.toThrow(
        `Replay record already exists for fingerprint fp_same`,
      );
    });

    it('rejects duplicate run_id', async () => {
      const runId = `run_${Date.now()}`;
      const record1 = makeReplayRecord({ run: { ...makeReplayRecord().run, run_id: runId } });
      const record2 = makeReplayRecord({ run: { ...makeReplayRecord().run, run_id: runId } });
      
      await saveReplayRecord(record1);
      
      await expect(saveReplayRecord(record2)).rejects.toThrow(
        `Replay record already exists for run_id ${runId}`,
      );
    });
  });

  describe('Index Queries', () => {
    it('hasFingerprint returns true after save', async () => {
      const record = makeReplayRecord();
      expect(hasFingerprint(record.fingerprint)).toBe(false);
      
      await saveReplayRecord(record);
      expect(hasFingerprint(record.fingerprint)).toBe(true);
    });

    it('hasRunId returns true after save', async () => {
      const record = makeReplayRecord();
      expect(hasRunId(record.run.run_id)).toBe(false);
      
      await saveReplayRecord(record);
      expect(hasRunId(record.run.run_id)).toBe(true);
    });
  });

  describe('Integrity Verification', () => {
    it('verifies cache integrity when valid', async () => {
      const record1 = makeReplayRecord();
      const record2 = makeReplayRecord();
      
      await saveReplayRecord(record1);
      await saveReplayRecord(record2);
      
      const result = verifyReplayStoreIntegrity();
      expect(result.valid).toBe(true);
      expect(result.record_count).toBe(2);
      expect(result.duplicate_snapshot_ids).toHaveLength(0);
      expect(result.duplicate_run_ids).toHaveLength(0);
    });
  });

  describe('Cache Isolation', () => {
    it('returns cloned records not references', async () => {
      const record = makeReplayRecord();
      await saveReplayRecord(record);
      
      const loaded1 = getReplayRecord(record.snapshot.snapshot_id);
      const loaded2 = getReplayRecord(record.snapshot.snapshot_id);
      
      expect(loaded1).toEqual(loaded2);
      expect(loaded1).not.toBe(loaded2); // Different objects
    });
  });
});
