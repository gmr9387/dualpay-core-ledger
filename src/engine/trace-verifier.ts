/**
 * Trace Verifier
 *
 * Verifies:
 * - Snapshot integrity
 * - Trace fingerprint integrity
 * - Replay determinism
 * - Run consistency
 *
 * Also records verification events in the replay ledger.
 */

import type { AdjudicationRun } from '@/types/claim';
import type { ReplaySnapshot } from './replay-snapshot';

import { replaySnapshot } from './replay-engine';
import { buildTraceFingerprint } from './hash';
import { appendLedgerEvent, type ReplayLedgerEvent } from './replay-ledger';

const DEFAULT_VERIFICATION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export interface VerificationResult {
  verified: boolean;

  snapshot_match: boolean;
  replay_match: boolean;

  original_fingerprint?: string;
  replay_fingerprint?: string;

  differences: string[];

  verified_at: string;

  ledger_event?: ReplayLedgerEvent;
}

export interface VerifyReplayOptions {
  actor?: string;
  verifiedAt?: string;
  writeLedgerEvent?: boolean;
}

export async function verifyReplay(
  snapshot: ReplaySnapshot,
  originalRun: AdjudicationRun,
  originalFingerprint: string,
  options: VerifyReplayOptions = {},
): Promise<VerificationResult> {
  const actor = options.actor ?? 'system';
  const verifiedAt =
    options.verifiedAt ??
    snapshot.created_at ??
    DEFAULT_VERIFICATION_TIMESTAMP;

  const replay = replaySnapshot(
    snapshot,
    originalRun,
  );

  const replayFingerprint =
    await buildTraceFingerprint({
      claim: snapshot.claim,
      accumulators: snapshot.accumulators,
      contract: snapshot.contract,
      plan: snapshot.plan,
      priorOutcomes: snapshot.prior_outcomes,
      calcPolicyVersion:
        snapshot.calc_policy_version,
    });

  const snapshotMatch =
    replayFingerprint === originalFingerprint;

  const replayMatch =
    replay.deterministic_match;

  const verified =
    snapshotMatch &&
    replayMatch;

  let ledgerEvent: ReplayLedgerEvent | undefined;

  if (options.writeLedgerEvent !== false) {
    ledgerEvent = await appendLedgerEvent({
      type: verified
        ? 'VERIFICATION_PASSED'
        : 'VERIFICATION_FAILED',
      claim_id: snapshot.claim_id,
      run_id: originalRun.run_id,
      snapshot_id: snapshot.snapshot_id,
      actor,
      timestamp: verifiedAt,
      details: {
        original_trace_id: originalRun.trace_id,
        replay_trace_id: replay.replay_trace_id,
        original_fingerprint: originalFingerprint,
        replay_fingerprint: replayFingerprint,
        snapshot_match: snapshotMatch,
        replay_match: replayMatch,
        differences: replay.differences,
      },
    });
  }

  return {
    verified,

    snapshot_match:
      snapshotMatch,

    replay_match:
      replayMatch,

    original_fingerprint:
      originalFingerprint,

    replay_fingerprint:
      replayFingerprint,

    differences:
      replay.differences,

    verified_at:
      verifiedAt,

    ledger_event:
      ledgerEvent,
  };
}

export async function generateFingerprintForSnapshot(
  snapshot: ReplaySnapshot,
): Promise<string> {
  return buildTraceFingerprint({
    claim: snapshot.claim,
    accumulators: snapshot.accumulators,
    contract: snapshot.contract,
    plan: snapshot.plan,
    priorOutcomes: snapshot.prior_outcomes,
    calcPolicyVersion:
      snapshot.calc_policy_version,
  });
}