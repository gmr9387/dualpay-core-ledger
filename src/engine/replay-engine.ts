/**
 * Replay Engine
 *
 * Deterministically re-executes a historical adjudication
 * snapshot and verifies that outputs match.
 *
 * Deep replay comparison checks:
 * - totals
 * - line processing order
 * - final accumulators
 * - policy version
 * - line dollar outputs
 * - line status
 * - adjustments
 * - COB allocations
 * - denial reasons
 */

import type { AdjudicationRun } from '@/types/claim';
import { adjudicateClaim } from './calculation-engine';
import type { ReplaySnapshot } from './replay-snapshot';
import { canonicalStringify } from './canonical-json';

export interface ReplayResult {
  original_run_id: string;
  replay_run_id: string;

  deterministic_match: boolean;

  differences: string[];

  original_trace_id?: string;
  replay_trace_id?: string;

  original_run?: AdjudicationRun;
  replay_run: AdjudicationRun;
}

function compareCanonical(
  label: string,
  original: unknown,
  replay: unknown,
  diffs: string[],
): void {
  const a = canonicalStringify(original);
  const b = canonicalStringify(replay);

  if (a !== b) {
    diffs.push(`${label} mismatch`);
  }
}

function compareScalar<T>(
  label: string,
  original: T,
  replay: T,
  diffs: string[],
): void {
  if (original !== replay) {
    diffs.push(`${label} mismatch (${String(original)} vs ${String(replay)})`);
  }
}

function compareRuns(
  original: AdjudicationRun,
  replay: AdjudicationRun,
): string[] {
  const diffs: string[] = [];

  compareScalar(
    'total_plan_paid',
    original.total_plan_paid,
    replay.total_plan_paid,
    diffs,
  );

  compareScalar(
    'total_member_responsibility',
    original.total_member_responsibility,
    replay.total_member_responsibility,
    diffs,
  );

  compareScalar(
    'calc_policy_version',
    original.calc_policy_version,
    replay.calc_policy_version,
    diffs,
  );

  compareCanonical(
    'line_processing_order',
    original.line_processing_order,
    replay.line_processing_order,
    diffs,
  );

  compareCanonical(
    'final_accumulator',
    original.final_accumulator,
    replay.final_accumulator,
    diffs,
  );

  if (original.line_results.length !== replay.line_results.length) {
    diffs.push(
      `line count mismatch (${original.line_results.length} vs ${replay.line_results.length})`,
    );
    return diffs;
  }

  for (let i = 0; i < original.line_results.length; i += 1) {
    const a = original.line_results[i];
    const b = replay.line_results[i];

    const lineLabel = `line ${a.line_id}`;

    compareScalar(
      `${lineLabel}: line_id`,
      a.line_id,
      b.line_id,
      diffs,
    );

    compareScalar(
      `${lineLabel}: claim_id`,
      a.claim_id,
      b.claim_id,
      diffs,
    );

    compareScalar(
      `${lineLabel}: allowed`,
      a.allowed,
      b.allowed,
      diffs,
    );

    compareScalar(
      `${lineLabel}: deductible_applied`,
      a.deductible_applied,
      b.deductible_applied,
      diffs,
    );

    compareScalar(
      `${lineLabel}: coinsurance`,
      a.coinsurance,
      b.coinsurance,
      diffs,
    );

    compareScalar(
      `${lineLabel}: copay`,
      a.copay,
      b.copay,
      diffs,
    );

    compareScalar(
      `${lineLabel}: plan_paid`,
      a.plan_paid,
      b.plan_paid,
      diffs,
    );

    compareScalar(
      `${lineLabel}: member_responsibility`,
      a.member_responsibility,
      b.member_responsibility,
      diffs,
    );

    compareScalar(
      `${lineLabel}: status`,
      a.status,
      b.status,
      diffs,
    );

    compareCanonical(
      `${lineLabel}: adjustments`,
      a.adjustments,
      b.adjustments,
      diffs,
    );

    compareCanonical(
      `${lineLabel}: cob_allocations`,
      a.cob_allocations,
      b.cob_allocations,
      diffs,
    );

    compareCanonical(
      `${lineLabel}: denial_reasons`,
      a.denial_reasons ?? [],
      b.denial_reasons ?? [],
      diffs,
    );
  }

  return diffs;
}

export function replaySnapshot(
  snapshot: ReplaySnapshot,
  originalRun?: AdjudicationRun,
): ReplayResult {
  const { run, trace } = adjudicateClaim(
    snapshot.claim.lines,
    snapshot.accumulators,
    snapshot.contract,
    snapshot.plan,
    snapshot.prior_outcomes,
    {
      runId: `replay_${snapshot.snapshot_id}`,
      timestamp: snapshot.created_at,
      traceFingerprint: originalRun?.trace_id,
      snapshotRef: `snapshots/${snapshot.snapshot_id}`,
    },
  );

  if (!originalRun) {
    return {
      original_run_id: 'unknown',
      replay_run_id: run.run_id,
      deterministic_match: false,
      differences: [
        'original run missing; deterministic replay comparison was not performed',
      ],
      replay_run: run,
      replay_trace_id: trace.trace_id,
    };
  }

  const differences = compareRuns(
    originalRun,
    run,
  );

  return {
    original_run_id: originalRun.run_id,
    replay_run_id: run.run_id,

    deterministic_match:
      differences.length === 0,

    differences,

    original_trace_id: originalRun.trace_id,
    replay_trace_id: trace.trace_id,

    original_run: originalRun,
    replay_run: run,
  };
}