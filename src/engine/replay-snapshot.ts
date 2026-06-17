import type {
  Claim,
  MemberAccumulators,
  ContractTerms,
  PlanBenefits,
  PriorPayerOutcome,
} from '@/types/claim';

export interface ReplaySnapshot {
  snapshot_id: string;
  claim_id: string;
  created_at: string;
  calc_policy_version: string;

  claim: Claim;
  accumulators: MemberAccumulators;
  contract: ContractTerms;
  plan: PlanBenefits;
  prior_outcomes: PriorPayerOutcome[];
}

export function createReplaySnapshot(args: {
  claim: Claim;
  accumulators: MemberAccumulators;
  contract: ContractTerms;
  plan: PlanBenefits;
  priorOutcomes?: PriorPayerOutcome[];
  calcPolicyVersion?: string;
  createdAt?: string;
}): ReplaySnapshot {
  const createdAt = args.createdAt ?? '1970-01-01T00:00:00.000Z';
  const calcPolicyVersion = args.calcPolicyVersion ?? '1.0.0';

  return {
    snapshot_id: `snapshot_${args.claim.claim_id}_${calcPolicyVersion}`,
    claim_id: args.claim.claim_id,
    created_at: createdAt,
    calc_policy_version: calcPolicyVersion,

    claim: args.claim,
    accumulators: args.accumulators,
    contract: args.contract,
    plan: args.plan,
    prior_outcomes: args.priorOutcomes ?? [],
  };
}