/**
 * Replay Store
 *
 * In-memory replay record store for snapshots, runs, and fingerprints.
 *
 * Still demo-grade until backed by Supabase/Postgres, but hardened to:
 * - prevent silent overwrite
 * - preserve insertion order
 * - expose integrity checks
 * - avoid direct mutation of stored records
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

export function saveReplayRecord(record: ReplayRecord): void {
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

  const frozen = Object.freeze(cloneReplayRecord(record));
  replayStore.set(record.snapshot.snapshot_id, frozen);
  indexRecord(frozen);
}

export function upsertReplayRecordForDev(record: ReplayRecord): void {
  const existing = replayStore.get(record.snapshot.snapshot_id);
  if (existing) unindexRecord(existing);

  const frozen = Object.freeze(cloneReplayRecord(record));
  replayStore.set(record.snapshot.snapshot_id, frozen);
  indexRecord(frozen);
}

export function getReplayRecord(snapshotId: string): ReplayRecord | undefined {
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

export function getReplayRecordByFingerprint(
  fingerprint: string,
): ReplayRecord | undefined {
  const snapshotId = fingerprintIndex.get(fingerprint);
  if (!snapshotId) return undefined;
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

export function getReplayRecordByRunId(runId: string): ReplayRecord | undefined {
  const snapshotId = runIdIndex.get(runId);
  if (!snapshotId) return undefined;
  const record = replayStore.get(snapshotId);
  return record ? cloneReplayRecord(record) : undefined;
}

export function hasFingerprint(fingerprint: string): boolean {
  return fingerprintIndex.has(fingerprint);
}

export function hasRunId(runId: string): boolean {
  return runIdIndex.has(runId);
}

export function listReplayRecords(): ReplayRecord[] {
  return [...replayStore.values()]
    .map(cloneReplayRecord)
    .sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
}

export function listReplayRecordsInInsertOrder(): ReplayRecord[] {
  return [...replayStore.values()].map(cloneReplayRecord);
}

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
 *
 * Do not use in production workflows.
 */
export function deleteReplayRecord(snapshotId: string): boolean {
  return replayStore.delete(snapshotId);
}

/**
 * Dev/testing only.
 *
 * Do not use in production workflows.
 */
export function clearReplayStore(): void {
  replayStore.clear();
}