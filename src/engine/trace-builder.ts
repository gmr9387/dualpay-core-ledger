/**
 * Trace Builder — constructs structured Trace Objects for adjudication runs
 */

import type { TraceObject, RuleFiring, RuleCategory, MathStep, SourceBadge } from '@/types/trace';
import type { PlanBenefits, ContractTerms } from '@/types/claim';
import { generateId } from './calculation-engine';

const RULE_SET_VERSION = '1.0.0';
const CALC_POLICY_VERSION = '1.0.0';

export function createRuleFiring(
  order: number,
  ruleId: string,
  category: RuleCategory,
  inputsUsed: Record<string, unknown>,
  outputs: Record<string, unknown>,
  fragmentIds: string[]
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
  cobAdj?: number
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
  documentRef?: string
): SourceBadge {
  return { field_path: fieldPath, source_type: sourceType, confidence, document_ref: documentRef };
}

export function hashInputs(inputs: unknown): string {
  // Simple deterministic hash for input snapshot
  const str = JSON.stringify(inputs, (_key, value) => {
    if (value instanceof Map) return Object.fromEntries(value);
    return value;
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function buildTrace(
  runId: string,
  claimId: string,
  plan: PlanBenefits,
  contract: ContractTerms,
  ruleFirings: RuleFiring[],
  mathSteps: MathStep[]
): TraceObject {
  const traceId = generateId('trace');
  const inputsHash = hashInputs({ plan, contract });

  return {
    trace_id: traceId,
    run_id: runId,
    claim_id: claimId,
    timestamp: new Date().toISOString(),
    rule_set_version: RULE_SET_VERSION,
    plan_version: plan.plan_version,
    contract_version: contract.contract_version,
    calc_policy_version: CALC_POLICY_VERSION,
    inputs_snapshot_hash: inputsHash,
    snapshot_ref: `snapshots/${runId}/${inputsHash}`,
    rule_firings: ruleFirings,
    math_steps: mathSteps,
    source_badges: [],
  };
}
