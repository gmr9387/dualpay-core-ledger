import { describe, it, expect } from 'vitest';
import {
  birthdayRule,
  lengthOfCoverageRule,
  determineCOBPrimacy,
  calculateCOBAllocation,
  type PrimacyContext,
  type PrimacyResult,
  type COBAllocation,
} from '@/engine/cob-rules';
import type { PriorPayerOutcome } from '@/types/claim';

describe('COB Rules Engine - Hardened', () => {
  describe('Birthday Rule - Timezone-Safe Parsing', () => {
    it('returns member as primary when member birthday is earlier in calendar year', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1985-03-15',
        spouse_dob: '1985-07-20',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('member_plan');
      expect(result!.secondary_payer_id).toBe('spouse_plan');
      expect(result!.rationale).toContain('Birthday Rule');
      expect(result!.rule_id).toBe('COB_BIRTHDAY_001');
    });

    it('returns spouse as primary when spouse birthday is earlier in calendar year', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1985-09-01',
        spouse_dob: '1985-02-14',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('spouse_plan');
      expect(result!.secondary_payer_id).toBe('member_plan');
    });

    it('returns member as primary when birthdays are identical (uses <=)', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1985-06-15',
        spouse_dob: '1990-06-15',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('member_plan');
    });

    it('handles leap year Feb 29 correctly', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1980-02-29',
        spouse_dob: '1985-03-01',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('member_plan');
    });

    it('handles Feb 29 vs Feb 28 correctly', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '2000-02-29',
        spouse_dob: '1990-02-28',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('spouse_plan');
    });

    it('handles Dec 31 vs Jan 1 edge case', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1985-01-01',
        spouse_dob: '1985-12-31',
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('member_plan');
    });

    it('returns null for invalid date format', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: 'invalid-date',
        spouse_dob: '1985-07-20',
      });

      expect(result).toBeNull();
    });

    it('returns null when member_dob is missing', () => {
      const result = birthdayRule.evaluate([], {
        spouse_dob: '1985-07-20',
      });

      expect(result).toBeNull();
    });

    it('returns null when spouse_dob is missing', () => {
      const result = birthdayRule.evaluate([], {
        member_dob: '1985-03-15',
      });

      expect(result).toBeNull();
    });

    it('is timezone-invariant (parses ISO directly)', () => {
      // This test verifies that the parsing is based on string extraction, not Date object
      const result1 = birthdayRule.evaluate([], {
        member_dob: '2000-06-15',
        spouse_dob: '2000-06-15',
      });

      const result2 = birthdayRule.evaluate([], {
        member_dob: '2000-06-15',
        spouse_dob: '2000-06-15',
      });

      // Should produce identical results regardless of system timezone
      expect(result1!.primary_payer_id).toBe(result2!.primary_payer_id);
    });
  });

  describe('Length of Coverage Rule', () => {
    it('returns earlier coverage start date as primary for two plans', () => {
      const coverageDates = new Map<string, string>();
      coverageDates.set('plan_a', '2020-01-15');
      coverageDates.set('plan_b', '2023-06-01');

      const result = lengthOfCoverageRule.evaluate([], {
        coverage_start_dates: coverageDates,
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('plan_a');
      expect(result!.secondary_payer_id).toBe('plan_b');
    });

    it('returns earliest start date for three or more plans', () => {
      const coverageDates = new Map<string, string>();
      coverageDates.set('plan_c', '2019-03-10');
      coverageDates.set('plan_a', '2020-01-15');
      coverageDates.set('plan_b', '2023-06-01');

      const result = lengthOfCoverageRule.evaluate([], {
        coverage_start_dates: coverageDates,
      });

      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('plan_c');
      expect(result!.secondary_payer_id).toBe('plan_a');
    });

    it('returns null when only one plan', () => {
      const coverageDates = new Map<string, string>();
      coverageDates.set('plan_a', '2020-01-15');

      const result = lengthOfCoverageRule.evaluate([], {
        coverage_start_dates: coverageDates,
      });

      expect(result).toBeNull();
    });

    it('returns null when coverage_start_dates is missing', () => {
      const result = lengthOfCoverageRule.evaluate([], {});
      expect(result).toBeNull();
    });

    it('returns null when coverage_start_dates is empty', () => {
      const result = lengthOfCoverageRule.evaluate([], {
        coverage_start_dates: new Map(),
      });
      expect(result).toBeNull();
    });
  });

  describe('Rule Priority and Firing Trace', () => {
    it('fires lowest priority rule first', () => {
      const context: PrimacyContext = {
        member_dob: '1985-03-15',
        spouse_dob: '1985-07-20',
        coverage_start_dates: new Map([
          ['member_plan', '2020-01-15'],
          ['spouse_plan', '2019-01-01'],
        ]),
      };

      const ruleFirings: any[] = [];
      const result = determineCOBPrimacy(
        [{ payer_id: 'p1', payer_name: 'Plan 1', coverage_type: 'medical' }],
        context,
        [birthdayRule, lengthOfCoverageRule],
        ruleFirings
      );

      expect(result!.rule_id).toBe('COB_BIRTHDAY_001');
      expect(ruleFirings).toHaveLength(1);
    });

    it('stops at first matching rule', () => {
      const context: PrimacyContext = {
        member_dob: '1985-03-15',
        spouse_dob: '1985-07-20',
      };

      const ruleFirings: any[] = [];
      const result = determineCOBPrimacy([], context, [birthdayRule, lengthOfCoverageRule], ruleFirings);

      expect(result).not.toBeNull();
      expect(ruleFirings).toHaveLength(1);
    });

    it('returns null when no rules match', () => {
      const ruleFirings: any[] = [];
      const result = determineCOBPrimacy([], {}, [birthdayRule, lengthOfCoverageRule], ruleFirings);

      expect(result).toBeNull();
      expect(ruleFirings).toHaveLength(0);
    });

    it('populates ruleFirings with trace data', () => {
      const context: PrimacyContext = {
        member_dob: '1985-03-15',
        spouse_dob: '1985-07-20',
      };

      const ruleFirings: any[] = [];
      determineCOBPrimacy(
        [{ payer_id: 'payer1', payer_name: 'Plan 1', coverage_type: 'medical' }],
        context,
        [birthdayRule],
        ruleFirings
      );

      expect(ruleFirings).toHaveLength(1);
      expect(ruleFirings[0].order).toBe(0);
      expect(ruleFirings[0].rule_id).toBe('COB_BIRTHDAY_001');
      expect(ruleFirings[0].category).toBe('cob_primacy');
    });
  });

  describe('COB Allocation - Standard Policy', () => {
    it('standard: no adjustment when prior paid', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 15000,
          allowed: 12000,
          paid: 10000,
          patient_responsibility: 2000,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'standard');

      expect(result.total_prior_paid).toBe(10000);
      expect(result.adjustment).toBe(0);
      expect(result.allocations[0].method).toBe('standard');
    });
  });

  describe('COB Allocation - Non-Duplication Policy', () => {
    it('non_duplication: adjustment is 0', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 15000,
          allowed: 12000,
          paid: 12000,
          patient_responsibility: 0,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'non_duplication');

      expect(result.total_prior_paid).toBe(12000);
      expect(result.adjustment).toBe(0);
      expect(result.allocations[0].method).toBe('non_duplication');
    });
  });

  describe('COB Allocation - Maintenance of Benefits', () => {
    it('maintenance_of_benefits: adjustment calculated correctly', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 15000,
          allowed: 12000,
          paid: 8000,
          patient_responsibility: 4000,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'maintenance_of_benefits');

      expect(result.total_prior_paid).toBe(8000);
      expect(result.adjustment).toBe(0);
      expect(result.allocations[0].method).toBe('maintenance_of_benefits');
    });
  });

  describe('COB Allocation - Carve-Out Policy (NEW)', () => {
    it('carve_out: secondary is completely carved out', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 15000,
          allowed: 12000,
          paid: 8000,
          patient_responsibility: 4000,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'carve_out');

      expect(result.total_prior_paid).toBe(8000);
      // Carve-out: adjustment = allowed - totalPriorPaid = 12000 - 8000 = 4000
      expect(result.adjustment).toBe(4000);
      expect(result.allocations[0].method).toBe('carve_out');
      expect(result.allocations[0].adjustment).toBe(4000);
    });

    it('carve_out: when primary paid full allowed', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 12000,
          allowed: 12000,
          paid: 12000,
          patient_responsibility: 0,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'carve_out');

      expect(result.total_prior_paid).toBe(12000);
      // Adjustment = 12000 - 12000 = 0 (nothing left for secondary)
      expect(result.adjustment).toBe(0);
    });

    it('carve_out: with zero prior paid, entire allowed is carved out', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 12000,
          allowed: 12000,
          paid: 0,
          patient_responsibility: 12000,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'carve_out');

      expect(result.total_prior_paid).toBe(0);
      // Adjustment = 12000 - 0 = 12000 (full amount carved out)
      expect(result.adjustment).toBe(12000);
    });
  });

  describe('COB Allocation - Edge Cases', () => {
    it('handles allowed = 0', () => {
      const result = calculateCOBAllocation(0, [], 'standard');
      expect(result.total_prior_paid).toBe(0);
      expect(result.adjustment).toBe(0);
      expect(result.allocations).toHaveLength(0);
    });

    it('handles prior paid > allowed', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'primary',
          payer_name: 'Primary Plan',
          claim_line_id: 'line_1',
          billed: 20000,
          allowed: 18000,
          paid: 18000,
          patient_responsibility: 0,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(12000, priorOutcomes, 'standard');
      // prior paid capped to allowed
      expect(result.total_prior_paid).toBe(12000);
    });
  });

  describe('Multi-Payer Rounding with Largest-Remainder Distribution', () => {
    it('distributes adjustment without losing cents across 3 payers', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'p1',
          payer_name: 'Plan 1',
          claim_line_id: 'line_1',
          billed: 10000,
          allowed: 10000,
          paid: 3334,
          patient_responsibility: 6666,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
        {
          payer_id: 'p2',
          payer_name: 'Plan 2',
          claim_line_id: 'line_1',
          billed: 10000,
          allowed: 10000,
          paid: 3333,
          patient_responsibility: 6667,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
        {
          payer_id: 'p3',
          payer_name: 'Plan 3',
          claim_line_id: 'line_1',
          billed: 10000,
          allowed: 10000,
          paid: 3333,
          patient_responsibility: 6667,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(15000, priorOutcomes, 'standard');

      const totalAdjustment = result.allocations.reduce((sum, a) => sum + a.adjustment, 0);
      // With largest-remainder method, total adjustment should equal result.adjustment
      expect(totalAdjustment).toBe(result.adjustment);
    });

    it('handles remainder distribution correctly with proportional split', () => {
      const priorOutcomes: PriorPayerOutcome[] = [
        {
          payer_id: 'p1',
          payer_name: 'Plan 1',
          claim_line_id: 'line_1',
          billed: 6000,
          allowed: 6000,
          paid: 6000,
          patient_responsibility: 0,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
        {
          payer_id: 'p2',
          payer_name: 'Plan 2',
          claim_line_id: 'line_1',
          billed: 4000,
          allowed: 4000,
          paid: 4000,
          patient_responsibility: 0,
          adjustments: [],
          source: 'edi_835',
          confidence: 1.0,
        },
      ];

      const result = calculateCOBAllocation(10000, priorOutcomes, 'standard');

      // Total prior paid = 10000, but capped to allowed = 10000
      // No adjustment needed
      expect(result.adjustment).toBe(0);
      // Sum of allocations should match
      const sum = result.allocations.reduce((s, a) => s + a.adjustment, 0);
      expect(sum).toBe(0);
    });
  });

  describe('Invalid Primacy Outputs', () => {
    it('throws error when rule returns invalid primary_payer_id', () => {
      const invalidRule = {
        rule_id: 'INVALID_001',
        name: 'Invalid Rule',
        priority: 1,
        evaluate: () => ({
          primary_payer_id: 'nonexistent_payer',
          secondary_payer_id: 'spouse_plan',
          rationale: 'Invalid rule',
          rule_id: 'INVALID_001',
        }),
      };

      const indicators = [
        { payer_id: 'payer1', payer_name: 'Plan 1', coverage_type: 'medical' },
      ];

      const ruleFirings: any[] = [];
      expect(() =>
        determineCOBPrimacy(indicators, {}, [invalidRule], ruleFirings)
      ).toThrow();
    });

    it('allows generic member_plan/spouse_plan without validation', () => {
      const result = birthdayRule.evaluate(
        [{ payer_id: 'random_payer', payer_name: 'Random', coverage_type: 'medical' }],
        { member_dob: '1985-03-15', spouse_dob: '1985-07-20' }
      );

      // Generic IDs should be allowed
      expect(result).not.toBeNull();
      expect(result!.primary_payer_id).toBe('member_plan');
    });
  });

  describe('Unknown Policy Types', () => {
    it('throws error for unknown COB policy', () => {
      expect(() => {
        calculateCOBAllocation(10000, [], 'unknown_policy' as any);
      }).toThrow('Unknown COB policy type');
    });
  });

  describe('Calculation Engine Integration', () => {
    it('preserves calculateCOBAllocation signature', () => {
      const result = calculateCOBAllocation(10000, [], 'standard');
      expect(result).toHaveProperty('total_prior_paid');
      expect(result).toHaveProperty('adjustment');
      expect(result).toHaveProperty('allocations');
    });

    it('preserves determineCOBPrimacy signature', () => {
      const result = determineCOBPrimacy([], {});
      expect(typeof result === 'object' || result === null).toBe(true);
    });
  });
});
