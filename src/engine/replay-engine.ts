/**
 * Replay Engine
 *
 * Deterministically re-executes a historical adjudication
 * snapshot and verifies that outputs match.
 */

import type { AdjudicationRun } from '@/types/claim';
import { adjudicateClaim } from './calculation-engine';
import type { ReplaySnapshot } from './replay-snapshot';

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

function compareRuns(
  original: AdjudicationRun,
  replay: AdjudicationRun,
): string[] {
  const diffs: string[] = [];

  if (original.total_plan_paid !== replay.total_plan_paid) {
    diffs.push(
      `total_plan_paid mismatch (${original.total_plan_paid} vs ${replay.total_plan_paid})`,
    );
  }

  if (
    original.total_member_responsibility !==
    replay.total_member_responsibility
  ) {
    diffs.push(
      `member_responsibility mismatch (${original.total_member_responsibility} vs ${replay.total_member_responsibility})`,
    );
  }

  if (
    original.line_results.length !== replay.line_results.length
  ) {
    diffs.push('line count mismatch');
    return diffs;
  }

  for (let i = 0; i < original.line_results.length; i++) {
    const a = original.line_results[i];
    const b = replay.line_results[i];

    if (a.allowed !== b.allowed) {
      diffs.push(
        `line ${a.line_id}: allowed mismatch (${a.allowed} vs ${b.allowed})`,
      );
    }

    if (a.plan_paid !== b.plan_paid) {
      diffs.push(
        `line ${a.line_id}: plan_paid mismatch (${a.plan_paid} vs ${b.plan_paid})`,
      );
    }

    if (
      a.member_responsibility !==
      b.member_responsibility
    ) {
      diffs.push(
        `line ${a.line_id}: member responsibility mismatch`,
      );
    }
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
    },
  );

  if (!originalRun) {
    return {
      original_run_id: 'unknown',
      replay_run_id: run.run_id,
      deterministic_match: true,
      differences: [],
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