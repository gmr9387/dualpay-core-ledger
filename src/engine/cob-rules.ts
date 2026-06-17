/**
 * COB (Coordination of Benefits) Rules Engine
 *
 * Implements configurable rule-pack modules for COB primacy determination
 * and secondary allocation calculations.
 */

import type {
  PriorPayerOutcome,
  COBAllocation,
  COBPolicyType,
  OHIIndicator,
} from '@/types/claim';
import type { RuleFiring } from '@/types/trace';
import { createRuleFiring } from './trace-builder';

export interface COBPrimacyRule {
  rule_id: string;
  name: string;
  priority: number;
  evaluate: (indicators: OHIIndicator[], context: PrimacyContext) => PrimacyResult | null;
}

export interface PrimacyContext {
  member_dob?: string;
  spouse_dob?: string;
  custody_decree?: boolean;
  custodial_parent_payer_id?: string;
  employment_status?: string;
  coverage_start_dates?: Map<string, string>;
  msp_type?: string;
}

export interface PrimacyResult {
  primary_payer_id: string;
  secondary_payer_id: string;
  rationale: string;
  rule_id: string;
}

export const birthdayRule: COBPrimacyRule = {
  rule_id: 'COB_BIRTHDAY_001',
  name: 'Birthday Rule',
  priority: 10,
  evaluate: (_indicators, context) => {
    if (!context.member_dob || !context.spouse_dob) return null;

    const member = new Date(context.member_dob);
    const spouse = new Date(context.spouse_dob);

    const memberKey = `${String(member.getUTCMonth() + 1).padStart(2, '0')}-${String(member.getUTCDate()).padStart(2, '0')}`;
    const spouseKey = `${String(spouse.getUTCMonth() + 1).padStart(2, '0')}-${String(spouse.getUTCDate()).padStart(2, '0')}`;

    if (memberKey <= spouseKey) {
      return {
        primary_payer_id: 'member_plan',
        secondary_payer_id: 'spouse_plan',
        rationale: 'Member birthday earlier in calendar year (Birthday Rule)',
        rule_id: 'COB_BIRTHDAY_001',
      };
    }

    return {
      primary_payer_id: 'spouse_plan',
      secondary_payer_id: 'member_plan',
      rationale: 'Spouse birthday earlier in calendar year (Birthday Rule)',
      rule_id: 'COB_BIRTHDAY_001',
    };
  },
};

export const lengthOfCoverageRule: COBPrimacyRule = {
  rule_id: 'COB_LENGTH_001',
  name: 'Length of Coverage',
  priority: 20,
  evaluate: (_indicators, context) => {
    if (!context.coverage_start_dates || context.coverage_start_dates.size < 2) return null;

    const entries = Array.from(context.coverage_start_dates.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );

    return {
      primary_payer_id: entries[0][0],
      secondary_payer_id: entries[1][0],
      rationale: `Longer coverage period determines primacy (${entries[0][0]} started ${entries[0][1]})`,
      rule_id: 'COB_LENGTH_001',
    };
  },
};

export function determineCOBPrimacy(
  indicators: OHIIndicator[],
  context: PrimacyContext,
  rulePacks: COBPrimacyRule[] = [birthdayRule, lengthOfCoverageRule],
  ruleFirings: RuleFiring[] = [],
): PrimacyResult | null {
  const sorted = [...rulePacks].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const result = rule.evaluate(indicators, context);

    if (result) {
      ruleFirings.push(
        createRuleFiring(
          ruleFirings.length,
          rule.rule_id,
          'cob_primacy',
          {
            indicators: indicators.map((i) => i.payer_id),
            context_keys: Object.keys(context),
          },
          {
            primary: result.primary_payer_id,
            secondary: result.secondary_payer_id,
          },
          [`frag_cob_${rule.rule_id.toLowerCase()}`],
        ),
      );

      return result;
    }
  }

  return null;
}

function buildAllocations(
  priorOutcomes: PriorPayerOutcome[],
  method: COBPolicyType,
  totalAdjustment: number,
): COBAllocation[] {
  if (priorOutcomes.length === 0) return [];

  const totalPriorPaid = priorOutcomes.reduce((sum, po) => sum + po.paid, 0);

  return priorOutcomes.map((po) => {
    const ratio = totalPriorPaid > 0 ? po.paid / totalPriorPaid : 1 / priorOutcomes.length;

    return {
      payer_id: po.payer_id,
      payer_order: 1,
      allowed: po.allowed,
      paid: po.paid,
      adjustment: Math.round(totalAdjustment * ratio),
      method,
    };
  });
}

/**
 * Calculate secondary payer COB allocation.
 *
 * Engine invariant:
 * planPaid + memberResp + cobPriorPaid + cobAdjustment === allowed
 *
 * Therefore this function must return:
 * - total_prior_paid capped to allowed
 * - adjustment as the non-payable remaining portion caused by COB
 */
export function calculateCOBAllocation(
  allowed: number,
  priorOutcomes: PriorPayerOutcome[],
  cobPolicy: COBPolicyType,
): {
  total_prior_paid: number;
  adjustment: number;
  allocations: COBAllocation[];
} {
  const rawPriorPaid = priorOutcomes.reduce((sum, po) => sum + po.paid, 0);
  const totalPriorPaid = Math.min(Math.max(0, rawPriorPaid), allowed);

  let adjustment = 0;

  if (cobPolicy === 'standard') {
    // Standard secondary: remaining allowed can still flow into cost-sharing / plan payment.
    adjustment = 0;
  } else if (cobPolicy === 'non_duplication') {
    // Non-duplication: secondary does not duplicate primary payment.
    // If primary already paid allowed, the full allowed is accounted for by totalPriorPaid.
    // If primary paid less, remaining allowed is still available for normal secondary adjudication.
    adjustment = 0;
  } else if (cobPolicy === 'maintenance_of_benefits') {
    // Simplified MOB: secondary liability is capped by what remains after prior payment.
    // Any prior payment counts against the secondary's would-have-paid position.
    adjustment = Math.max(0, Math.min(allowed, rawPriorPaid) - totalPriorPaid);
  }

  const cappedAdjustment = Math.max(0, Math.min(adjustment, allowed - totalPriorPaid));

  return {
    total_prior_paid: totalPriorPaid,
    adjustment: cappedAdjustment,
    allocations: buildAllocations(priorOutcomes, cobPolicy, cappedAdjustment),
  };
}