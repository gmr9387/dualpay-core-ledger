/**
 * Replay Store
 *
 * Cache + persistence pattern:
 * - In-memory map for performance (read-through cache)
 * - Supabase for durability (source of truth)
 *
 * On startup:
 * - Load from Supabase into memory
 * - Serve from memory
 *
 * On save:
 * - Validate uniqueness
 * - Write to Supabase
 * - Write to memory
 *
 * Enforces:
 * - fingerprint uniqueness
 * - run_id uniqueness
 * - snapshot_id uniqueness
 */

import type { AdjudicationRun } from '@/types/claim';
import type { ReplaySnapshot } from './replay-snapshot';

export interface ReplayRecord {
  snapshot: ReplaySnapshot;
  run: AdjudicationRun;
  fingerprint: string;
  created_at: string;
}

export interface ReplayStoreIntegrityResult {
  valid: boolean;
  record_count: number;
  duplicate_snapshot_ids: string[];
  duplicate_run_ids: string[];
  missing_fingerprints: string[];
}

const replayStore = new Map<string, ReplayRecord>();
const fingerprintIndex = new Map<string, string>(); // fingerprint -> snapshot_id
const runIdIndex = new Map<string, string>(); // run_id -> snapshot_id

let storeInitialized = false;

function cloneReplayRecord(record: ReplayRecord): ReplayRecord {
  return {
    snapshot: record.snapshot,
    run: record.run,
    fingerprint: record.fingerprint,
    created_at: record.created_at,
  };
}

function indexRecord(record: ReplayRecord): void {
  fingerprintIndex.set(record.fingerprint, record.snapshot.snapshot_id);
  runIdIndex.set(record.run.run_id, record.snapshot.snapshot_id);
}

function unindexRecord(record: ReplayRecord): void {
  if (fingerprintIndex.get(record.fingerprint) === record.snapshot.snapshot_id) {
    fingerprintIndex.delete(record.fingerprint);
  }
  if (runIdIndex.get(record.run.run_id) === record.snapshot.snapshot_id) {
    runIdIndex.delete(record.run.run_id);
  }
}

/**
 * Initialize the replay store from persistent storage.
 * Call once on app startup.
 */
export async function initializeReplayStore(): Promise<void> {
  if (storeInitialized) return;

  try {
    const { listReplayRecordsPersistent } = await import('@/data/repository');
    const records = await listReplayRecordsPersistent();
    
    replayStore.clear();
    fingerprintIndex.clear();
    runIdIndex.clear();

    for (const record of records) {
      const frozen = Object.freeze(cloneReplayRecord(record));
      replayStore.set(record.snapshot.snapshot_id, frozen);
      indexRecord(frozen);
    }

    storeInitialized = true;
  } catch (error) {
    console.error('Failed to initialize replay store from persistence:', error);
    storeInitialized = true; // Mark as initialized even on error to avoid retry loops
  }
}

/**
 * Save a replay record to both cache and persistent storage.
 * Enforces uniqueness on snapshot_id, fingerprint, and run_id.
 */
export async function saveReplayRecord(record: ReplayRecord): Promise<void> {
  // Check memory cache first
  if (replayStore.has(record.snapshot.snapshot_id)) {
    throw new Error(
      `Replay record already exists for snapshot ${record.snapshot.snapshot_id}`,
    );
  }
  if (fingerprintIndex.has(record.fingerprint)) {
    throw new Error(
      `Replay record already exists for fingerprint ${record.fingerprint}`,
    );
  }
  if (runIdIndex.has(record.run.run_id)) {
    throw new Error(
      `Replay record already exists for run_id ${record.run.run_id}`,
    );
  }

  // Persist to DB
  try {
    const { saveReplayRecordPersistent } = await import('@/data/repository');
    await saveReplayRecordPersistent(record);
  } catch (error) {
    throw new Error(`Failed to persist replay record: ${error}`);
  }

  // Update cache
  const frozen = Object.freeze(cloneReplayRecord(record));
  replayStore.set(record.snapshot.snapshot_id, frozen);
  indexRecord(frozen);
}

/**
 * Upsert a replay record (dev/testing only).
 */
export function upsertReplayRecordForDev(record: ReplayRecord): void {
  const existing = replayStore.get(record.snapshot.snapshot_id);
  if (existing) unindexRecord(existing);

  const frozen = Object.freeze(cloneReplayRecord(record));
  replayStore.set(record.snapshot.snapshot_id, frozen);
  indexRecord(frozen);
}

/**
 * Get a replay record by snapshot_id from cache.
 */
export function getReplayRecord(snapshotId: string): ReplayRecord | undefined {
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

/**
 * Get a replay record by fingerprint from cache.
 * Used for detecting duplicate adjudications.
 */
export function getReplayRecordByFingerprint(
  fingerprint: string,
): ReplayRecord | undefined {
  const snapshotId = fingerprintIndex.get(fingerprint);
  if (!snapshotId) return undefined;
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

/**
 * Get a replay record by run_id from cache.
 * Used for detecting duplicate run IDs.
 */
export function getReplayRecordByRunId(runId: string): ReplayRecord | undefined {
  const snapshotId = runIdIndex.get(runId);
  if (!snapshotId) return undefined;
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

/**
 * Check if a fingerprint exists in cache.
 */
export function hasFingerprint(fingerprint: string): boolean {
  return fingerprintIndex.has(fingerprint);
}

/**
 * Check if a run_id exists in cache.
 */
export function hasRunId(runId: string): boolean {
  return runIdIndex.has(runId);
}

/**
 * List all replay records from cache (newest first).
 */
export function listReplayRecords(): ReplayRecord[] {
  return [...replayStore.values()]
    .map(cloneReplayRecord)
    .sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
}

/**
 * List all replay records from cache in insertion order.
 */
export function listReplayRecordsInInsertOrder(): ReplayRecord[] {
  return [...replayStore.values()].map(cloneReplayRecord);
}

/**
 * Verify the integrity of the replay store cache.
 */
export function verifyReplayStoreIntegrity(): ReplayStoreIntegrityResult {
  const records = [...replayStore.values()];

  const snapshotCounts = new Map<string, number>();
  const runCounts = new Map<string, number>();
  const missingFingerprints: string[] = [];

  for (const record of records) {
    snapshotCounts.set(
      record.snapshot.snapshot_id,
      (snapshotCounts.get(record.snapshot.snapshot_id) ?? 0) + 1,
    );

    runCounts.set(
      record.run.run_id,
      (runCounts.get(record.run.run_id) ?? 0) + 1,
    );

    if (!record.fingerprint) {
      missingFingerprints.push(record.snapshot.snapshot_id);
    }
  }

  const duplicateSnapshotIds = [...snapshotCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([snapshotId]) => snapshotId);

  const duplicateRunIds = [...runCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([runId]) => runId);

  return {
    valid:
      duplicateSnapshotIds.length === 0 &&
      duplicateRunIds.length === 0 &&
      missingFingerprints.length === 0,
    record_count: records.length,
    duplicate_snapshot_ids: duplicateSnapshotIds,
    duplicate_run_ids: duplicateRunIds,
    missing_fingerprints: missingFingerprints,
  };
}

/**
 * Dev/testing only.
 * Do not use in production workflows.
 */
export function deleteReplayRecord(snapshotId: string): boolean {
  const existing = replayStore.get(snapshotId);
  if (existing) unindexRecord(existing);
  return replayStore.delete(snapshotId);
}

/**
 * Dev/testing only.
 * Do not use in production workflows.
 */
export function clearReplayStore(): void {
  replayStore.clear();
  fingerprintIndex.clear();
  runIdIndex.clear();
  storeInitialized = false;
}
