/**
 * Trace Builder — constructs structured Trace Objects for adjudication runs.
 *
 * Important:
 * - No Date.now()
 * - No new Date()
 * - No FNV / weak hash
 * - No module-global ID generation
 *
 * The trace receives its canonical SHA-256 fingerprint from the caller.
 */

import type {
  TraceObject,
  RuleFiring,
  RuleCategory,
  MathStep,
  SourceBadge,
} from '@/types/trace';
import type { PlanBenefits, ContractTerms } from '@/types/claim';

const RULE_SET_VERSION = '1.0.0';
const CALC_POLICY_VERSION = '1.0.0';
const DEFAULT_TRACE_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export interface BuildTraceOptions {
  fingerprint?: string;
  timestamp?: string;
  snapshotRef?: string;
  traceId?: string;
}

export function createRuleFiring(
  order: number,
  ruleId: string,
  category: RuleCategory,
  inputsUsed: Record<string, unknown>,
  outputs: Record<string, unknown>,
  fragmentIds: string[],
): RuleFiring {
  return {
    order,
    rule_id: ruleId,
    category,
    inputs_used: inputsUsed,
    outputs,
    explanation_fragment_ids: fragmentIds,
  };
}

export function createMathStep(
  lineId: string,
  billed: number,
  allowed: number,
  deductible: number,
  coinsurance: number,
  copay: number,
  planPaid: number,
  memberResp: number,
  cobPriorPaid?: number,
  cobAdj?: number,
): MathStep {
  return {
    line_id: lineId,
    billed,
    allowed,
    deductible,
    coinsurance,
    copay,
    plan_paid: planPaid,
    member_responsibility: memberResp,
    cob_prior_paid: cobPriorPaid,
    cob_adjustment: cobAdj,
  };
}

export function createSourceBadge(
  fieldPath: string,
  sourceType: SourceBadge['source_type'],
  confidence: number,
  documentRef?: string,
): SourceBadge {
  return {
    field_path: fieldPath,
    source_type: sourceType,
    confidence,
    document_ref: documentRef,
  };
}

function fallbackTraceId(runId: string, claimId: string): string {
  return `trace_${claimId}_${runId}`;
}

export function buildTrace(
  runId: string,
  claimId: string,
  plan: PlanBenefits,
  contract: ContractTerms,
  ruleFirings: RuleFiring[],
  mathSteps: MathStep[],
  options: BuildTraceOptions = {},
): TraceObject {
  const traceId =
    options.traceId ??
    fallbackTraceId(runId, claimId);

  const fingerprint =
    options.fingerprint ??
    `unfingerprinted_${claimId}_${runId}`;

  const timestamp =
    options.timestamp ??
    DEFAULT_TRACE_TIMESTAMP;

  const snapshotRef =
    options.snapshotRef ??
    `snapshots/${runId}/${fingerprint}`;

  return {
    trace_id: traceId,
    run_id: runId,
    claim_id: claimId,
    timestamp,
    rule_set_version: RULE_SET_VERSION,
    plan_version: plan.plan_version,
    contract_version: contract.contract_version,
    calc_policy_version: CALC_POLICY_VERSION,
    inputs_snapshot_hash: fingerprint,
    snapshot_ref: snapshotRef,
    rule_firings: ruleFirings,
    math_steps: mathSteps,
    source_badges: [],
  };
}