/**
 * COB (Coordination of Benefits) Rules Engine
 *
 * Implements configurable rule-pack modules for COB primacy determination
 * and secondary allocation calculations.
 *
 * HARDENED: 
 * - Timezone-safe date parsing for birthday rule
 * - Explicit carve_out policy implementation
 * - Largest-remainder distribution for multi-payer rounding
 * - Primacy output validation against OHI indicators
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

/**
 * Extract month-day string from ISO date without timezone conversion.
 * Parses YYYY-MM-DD format directly to avoid Date() constructor issues.
 * @param isoDate ISO date string (YYYY-MM-DD)
 * @returns MM-DD format for comparison, or null if invalid
 */
function extractMonthDayFromISO(isoDate: string): string | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, , month, day] = match;
  return `${month}-${day}`;
}

/**
 * Birthday Rule: Earlier birthday in calendar year is primary.
 * Uses ISO string parsing to avoid timezone issues with Date() constructor.
 */
export const birthdayRule: COBPrimacyRule = {
  rule_id: 'COB_BIRTHDAY_001',
  name: 'Birthday Rule',
  priority: 10,
  evaluate: (_indicators, context) => {
    if (!context.member_dob || !context.spouse_dob) return null;

    const memberKey = extractMonthDayFromISO(context.member_dob);
    const spouseKey = extractMonthDayFromISO(context.spouse_dob);

    if (!memberKey || !spouseKey) return null;

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

/**
 * Length of Coverage Rule: Earlier coverage start date is primary.
 * Uses string comparison (ISO dates sort correctly lexicographically).
 */
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

/**
 * Validate primacy rule output against OHI indicators.
 * Ensures primary and secondary payers are present in the claim indicators.
 * @throws Error if primacy IDs not found in indicators
 */
function validatePrimacyOutput(
  result: PrimacyResult,
  indicators: OHIIndicator[],
  ruleId: string,
): void {
  if (indicators.length === 0) {
    // No indicators to validate against
    return;
  }

  const validPayers = new Set(indicators.map((i) => i.payer_id));

  // Only validate if the result uses explicit payer IDs (not generic 'member_plan' / 'spouse_plan')
  if (result.primary_payer_id !== 'member_plan' && result.primary_payer_id !== 'spouse_plan') {
    if (!validPayers.has(result.primary_payer_id)) {
      throw new Error(
        `Rule ${ruleId} returned invalid primary_payer_id: ${result.primary_payer_id}. ` +
          `Valid payers: ${Array.from(validPayers).join(', ')}`,
      );
    }
  }

  if (result.secondary_payer_id !== 'member_plan' && result.secondary_payer_id !== 'spouse_plan') {
    if (!validPayers.has(result.secondary_payer_id)) {
      throw new Error(
        `Rule ${ruleId} returned invalid secondary_payer_id: ${result.secondary_payer_id}. ` +
          `Valid payers: ${Array.from(validPayers).join(', ')}`,
      );
    }
  }
}

/**
 * Determine COB primacy by evaluating rules in priority order.
 * Stops at first matching rule.
 * 
 * @param indicators OHI indicators (payers on claim)
 * @param context Primacy determination context
 * @param rulePacks Rules to evaluate (default: [birthdayRule, lengthOfCoverageRule])
 * @param ruleFirings Output array - populated with trace data for fired rules
 * @returns Primary/secondary payer IDs and rationale, or null if no rules match
 * @throws Error if rule returns invalid payer IDs
 */
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
      // Validate output before returning
      validatePrimacyOutput(result, indicators, rule.rule_id);

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

/**
 * Largest-remainder distribution for rounding.
 * Distributes total across parts while preserving exact sum.
 * 
 * @param total Total amount to distribute
 * @param parts Number of recipients
 * @returns Array of amounts where sum equals total
 */
function largestRemainderDistribution(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  if (parts === 1) return [total];

  const base = Math.floor(total / parts);
  const remainder = total % parts;

  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Build COB allocations with proper rounding using largest-remainder method.
 * Ensures sum of allocations equals totalAdjustment (no cents lost).
 */
function buildAllocations(
  priorOutcomes: PriorPayerOutcome[],
  method: COBPolicyType,
  totalAdjustment: number,
): COBAllocation[] {
  if (priorOutcomes.length === 0) return [];

  const totalPriorPaid = priorOutcomes.reduce((sum, po) => sum + po.paid, 0);

  // Calculate ratios for proportional distribution
  const ratios = priorOutcomes.map((po) =>
    totalPriorPaid > 0 ? po.paid / totalPriorPaid : 1 / priorOutcomes.length,
  );

  // Calculate ideal (floating-point) allocations
  const idealAllocations = ratios.map((ratio) => totalAdjustment * ratio);

  // Use largest-remainder method to round to integers while preserving sum
  const flooredAllocations = idealAllocations.map((val) => Math.floor(val));
  const remainders = idealAllocations.map((val, i) => ({
    index: i,
    remainder: val - flooredAllocations[i],
  }));

  // Sort by remainder (descending) and distribute extra cents
  const sortedRemainders = remainders
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, totalAdjustment - flooredAllocations.reduce((sum, val) => sum + val, 0));

  const finalAllocations = [...flooredAllocations];
  for (const { index } of sortedRemainders) {
    finalAllocations[index]++;
  }

  return priorOutcomes.map((po, index) => ({
    payer_id: po.payer_id,
    payer_order: 1,
    allowed: po.allowed,
    paid: po.paid,
    adjustment: finalAllocations[index],
    method,
  }));
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
 * 
 * COB Policy Types:
 * - standard: Primary paid counts; secondary can still pay remaining allowed
 * - non_duplication: Primary paid counts; secondary limited to avoid duplication
 * - carve_out: Primary paid counts; secondary cannot pay (full carve-out)
 * - maintenance_of_benefits: Primary payment limits secondary liability
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
  } else if (cobPolicy === 'carve_out') {
    // Carve-out: Secondary is completely carved out when primary has paid.
    // The entire allowed amount is adjustment (secondary liability = 0).
    adjustment = Math.max(0, allowed - totalPriorPaid);
  } else if (cobPolicy === 'maintenance_of_benefits') {
    // Simplified MOB: secondary liability is capped by what remains after prior payment.
    // Any prior payment counts against the secondary's would-have-paid position.
    adjustment = Math.max(0, Math.min(allowed, rawPriorPaid) - totalPriorPaid);
  } else {
    // Unknown policy type - fail explicitly
    throw new Error(
      `Unknown COB policy type: ${cobPolicy}. ` +
        `Valid types: standard, non_duplication, carve_out, maintenance_of_benefits`,
    );
  }

  const cappedAdjustment = Math.max(0, Math.min(adjustment, allowed - totalPriorPaid));

  return {
    total_prior_paid: totalPriorPaid,
    adjustment: cappedAdjustment,
    allocations: buildAllocations(priorOutcomes, cobPolicy, cappedAdjustment),
  };
}
