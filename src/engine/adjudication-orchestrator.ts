/**
 * Adjudication Orchestrator
 *
 * Preferred kernel entry point for adjudications that must be
 * replayable, fingerprinted, and ledgered.
 */

import type {
  Claim,
  MemberAccumulators,
  ContractTerms,
  PlanBenefits,
  PriorPayerOutcome,
  AdjudicationRun,
} from '@/types/claim';
import type { TraceObject } from '@/types/trace';

import { adjudicateClaim } from './calculation-engine';
import { createReplaySnapshot, type ReplaySnapshot } from './replay-snapshot';
import { buildTraceFingerprint } from './hash';
import { saveReplayRecord } from './replay-store';
import { appendLedgerEvent, type ReplayLedgerEvent } from './replay-ledger';

const DEFAULT_CALC_POLICY_VERSION = '1.0.0';
const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export interface ExecuteAdjudicationArgs {
  claim: Claim;
  accumulators: MemberAccumulators;
  contract: ContractTerms;
  plan: PlanBenefits;
  priorOutcomes?: PriorPayerOutcome[];

  actor?: string;
  runId?: string;
  timestamp?: string;
  calcPolicyVersion?: string;
}

export interface ExecuteAdjudicationResult {
  run: AdjudicationRun;
  trace: TraceObject;
  snapshot: ReplaySnapshot;
  fingerprint: string;
  ledger_events: ReplayLedgerEvent[];
}

export async function executeAdjudicationWithReplay(
  args: ExecuteAdjudicationArgs,
): Promise<ExecuteAdjudicationResult> {
  const timestamp = args.timestamp ?? DEFAULT_TIMESTAMP;
  const actor = args.actor ?? 'system';
  const calcPolicyVersion =
    args.calcPolicyVersion ?? DEFAULT_CALC_POLICY_VERSION;
  const priorOutcomes = args.priorOutcomes ?? [];

  const runId =
    args.runId ?? `run_${args.claim.claim_id}_${calcPolicyVersion}`;

  const snapshot = createReplaySnapshot({
    claim: args.claim,
    accumulators: args.accumulators,
    contract: args.contract,
    plan: args.plan,
    priorOutcomes,
    calcPolicyVersion,
    createdAt: timestamp,
  });

  const fingerprint = await buildTraceFingerprint({
    claim: args.claim,
    accumulators: args.accumulators,
    contract: args.contract,
    plan: args.plan,
    priorOutcomes,
    calcPolicyVersion,
  });

  const snapshotRef = `snapshots/${runId}/${fingerprint}`;
  const traceId = `trace_${args.claim.claim_id}_${fingerprint.slice(0, 16)}`;

  const { run, trace } = adjudicateClaim(
    args.claim.lines,
    args.accumulators,
    args.contract,
    args.plan,
    priorOutcomes,
    {
      runId,
      timestamp,
      traceFingerprint: fingerprint,
      snapshotRef,
      traceId,
    },
  );

  saveReplayRecord({
    snapshot,
    run,
    fingerprint,
    created_at: timestamp,
  });

  const ledger_events: ReplayLedgerEvent[] = [];

  ledger_events.push(
    await appendLedgerEvent({
      type: 'ADJUDICATION_CREATED',
      claim_id: args.claim.claim_id,
      run_id: run.run_id,
      snapshot_id: snapshot.snapshot_id,
      actor,
      timestamp,
      details: {
        trace_id: trace.trace_id,
        total_plan_paid: run.total_plan_paid,
        total_member_responsibility: run.total_member_responsibility,
      },
    }),
  );

  ledger_events.push(
    await appendLedgerEvent({
      type: 'SNAPSHOT_CREATED',
      claim_id: args.claim.claim_id,
      run_id: run.run_id,
      snapshot_id: snapshot.snapshot_id,
      actor,
      timestamp,
      details: {
        calc_policy_version: calcPolicyVersion,
        snapshot_ref: snapshotRef,
      },
    }),
  );

  ledger_events.push(
    await appendLedgerEvent({
      type: 'FINGERPRINT_CREATED',
      claim_id: args.claim.claim_id,
      run_id: run.run_id,
      snapshot_id: snapshot.snapshot_id,
      actor,
      timestamp,
      details: {
        fingerprint,
      },
    }),
  );

  ledger_events.push(
    await appendLedgerEvent({
      type: 'REPLAY_RECORD_SAVED',
      claim_id: args.claim.claim_id,
      run_id: run.run_id,
      snapshot_id: snapshot.snapshot_id,
      actor,
      timestamp,
      details: {
        replay_ready: true,
      },
    }),
  );

  return {
    run,
    trace,
    snapshot,
    fingerprint,
    ledger_events,
  };
}