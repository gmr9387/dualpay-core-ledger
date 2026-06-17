/**
 * Trace Verifier
 *
 * Verifies:
 * - Snapshot integrity
 * - Trace fingerprint integrity
 * - Replay determinism
 * - Run consistency
 */

import type { AdjudicationRun } from '@/types/claim';
import type { ReplaySnapshot } from './replay-snapshot';

import { replaySnapshot } from './replay-engine';
import { buildTraceFingerprint } from './hash';

export interface VerificationResult {
  verified: boolean;

  snapshot_match: boolean;
  replay_match: boolean;

  original_fingerprint?: string;
  replay_fingerprint?: string;

  differences: string[];

  verified_at: string;
}

export async function verifyReplay(
  snapshot: ReplaySnapshot,
  originalRun: AdjudicationRun,
  originalFingerprint: string,
): Promise<VerificationResult> {
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

  return {
    verified:
      snapshotMatch &&
      replayMatch,

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
      new Date().toISOString(),
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