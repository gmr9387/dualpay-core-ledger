/**
 * Replay Store
 *
 * In-memory replay ledger for snapshots, runs, and fingerprints.
 * Later this can be backed by Supabase/Postgres.
 */

import type { AdjudicationRun } from '@/types/claim';
import type { ReplaySnapshot } from './replay-snapshot';

export interface ReplayRecord {
  snapshot: ReplaySnapshot;
  run: AdjudicationRun;
  fingerprint: string;
  created_at: string;
}

const replayStore = new Map<string, ReplayRecord>();

export function saveReplayRecord(record: ReplayRecord): void {
  replayStore.set(record.snapshot.snapshot_id, record);
}

export function getReplayRecord(snapshotId: string): ReplayRecord | undefined {
  return replayStore.get(snapshotId);
}

export function listReplayRecords(): ReplayRecord[] {
  return [...replayStore.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export function deleteReplayRecord(snapshotId: string): boolean {
  return replayStore.delete(snapshotId);
}

export function clearReplayStore(): void {
  replayStore.clear();
}