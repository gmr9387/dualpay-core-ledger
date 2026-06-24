import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeIdempotencyKey,
  isIdempotencyKeyConsumed,
  clearIdempotencyKeysForDev,
  canTransition,
  CLAIM_TRANSITIONS,
  type TransitionContext,
} from '@/engine/state-machine';
import type { ClaimStatus } from '@/types/claim';

describe('State Machine — Idempotency', () => {
  beforeEach(() => {
    clearIdempotencyKeysForDev();
  });

  describe('Idempotency Key Consumption', () => {
    it('consumeIdempotencyKey returns true on first use', () => {
      const key = 'idem_abc123';
      const result = consumeIdempotencyKey(key);
      expect(result).toBe(true);
    });

    it('consumeIdempotencyKey returns false on reuse (already consumed)', () => {
      const key = 'idem_abc123';
      consumeIdempotencyKey(key);
      const result = consumeIdempotencyKey(key);
      expect(result).toBe(false);
    });

    it('isIdempotencyKeyConsumed correctly tracks consumed keys', () => {
      const key = 'idem_abc123';
      
      // Before consumption
      expect(isIdempotencyKeyConsumed(key)).toBe(false);
      
      // After consumption
      consumeIdempotencyKey(key);
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
    });

    it('different keys are tracked separately', () => {
      const key1 = 'idem_abc123';
      const key2 = 'idem_def456';
      
      consumeIdempotencyKey(key1);
      expect(isIdempotencyKeyConsumed(key1)).toBe(true);
      expect(isIdempotencyKeyConsumed(key2)).toBe(false);
      
      consumeIdempotencyKey(key2);
      expect(isIdempotencyKeyConsumed(key1)).toBe(true);
      expect(isIdempotencyKeyConsumed(key2)).toBe(true);
    });

    it('rejects empty idempotency key', () => {
      const result = consumeIdempotencyKey('');
      expect(result).toBe(false);
    });

    it('clears idempotency keys for dev', () => {
      const key = 'idem_abc123';
      consumeIdempotencyKey(key);
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
      
      clearIdempotencyKeysForDev();
      expect(isIdempotencyKeyConsumed(key)).toBe(false);
    });
  });

  describe('Payment Transitions with Idempotency Keys', () => {
    it('allows payment transition ADJUDICATED → PAYMENT_IN_PROGRESS with fresh key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: 'idem_fresh_123',
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('rejects payment transition without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: '',  // Empty key
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('REQUIRE_IDEMPOTENCY_KEY');
    });

    it('rejects payment transition with already-consumed key', () => {
      const key = 'idem_already_used';
      consumeIdempotencyKey(key);
      
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: key,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('IDEMPOTENCY_KEY_ALREADY_USED');
    });

    it('allows second payment transition PAYMENT_IN_PROGRESS → PAID with fresh key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'PAYMENT_IN_PROGRESS',
        targetStatus: 'PAID',
        idempotencyKey: 'idem_fresh_456',
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('rejects PAYMENT_IN_PROGRESS → PAID without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'PAYMENT_IN_PROGRESS',
        targetStatus: 'PAID',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('REQUIRE_IDEMPOTENCY_KEY');
    });
  });

  describe('Non-Payment Transitions (No Idempotency Required)', () => {
    it('allows RECEIVED → ELIGIBILITY_CHECK without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'RECEIVED',
        targetStatus: 'ELIGIBILITY_CHECK',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('allows ELIGIBILITY_CHECK → IN_ADJUDICATION without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ELIGIBILITY_CHECK',
        targetStatus: 'IN_ADJUDICATION',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('allows IN_ADJUDICATION → ADJUDICATED without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'IN_ADJUDICATION',
        targetStatus: 'ADJUDICATED',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('allows IN_ADJUDICATION → PENDED without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'IN_ADJUDICATION',
        targetStatus: 'PENDED',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('allows PENDED → IN_ADJUDICATION without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'PENDED',
        targetStatus: 'IN_ADJUDICATION',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('does not consume idempotency key for non-payment transitions', () => {
      const key = 'idem_non_payment';
      
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'RECEIVED',
        targetStatus: 'ELIGIBILITY_CHECK',
        idempotencyKey: key,
      };
      
      canTransition(context);
      
      // Key should NOT be consumed for non-payment transitions
      expect(isIdempotencyKeyConsumed(key)).toBe(false);
    });
  });

  describe('COB Transitions with Primacy Confirmation', () => {
    it('rejects COB_ROUTED → IN_ADJUDICATION without primacy confirmation or override', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'COB_ROUTED',
        targetStatus: 'IN_ADJUDICATION',
        hasPrimacyConfirmation: false,
        hasExceptionOverride: false,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('REQUIRE_PRIMACY_CONFIRMATION');
    });

    it('allows COB_ROUTED → IN_ADJUDICATION with primacy confirmation', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'COB_ROUTED',
        targetStatus: 'IN_ADJUDICATION',
        hasPrimacyConfirmation: true,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('allows COB_ROUTED → IN_ADJUDICATION with exception override', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'COB_ROUTED',
        targetStatus: 'IN_ADJUDICATION',
        hasPrimacyConfirmation: false,
        hasExceptionOverride: true,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Invalid Transitions', () => {
    it('rejects invalid transition (no valid path defined)', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'PAID',
        targetStatus: 'RECEIVED',  // Invalid: cannot go backwards
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('NO_VALID_TRANSITION');
    });
  });

  describe('Idempotency Key Persistence', () => {
    it('consumed key persists across multiple checks', () => {
      const key = 'idem_persistent';
      
      // First consumption
      const result1 = consumeIdempotencyKey(key);
      expect(result1).toBe(true);
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
      
      // Second check
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
      
      // Second consumption attempt
      const result2 = consumeIdempotencyKey(key);
      expect(result2).toBe(false);
      
      // Still consumed
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
    });

    it('payment transition prevents duplicate execution via key reuse', () => {
      const key = 'idem_payment_flow';
      
      // First payment attempt
      const context1: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: key,
      };
      
      const result1 = canTransition(context1);
      expect(result1.allowed).toBe(true);
      
      // In production, after payment succeeds, key would be marked as consumed
      consumeIdempotencyKey(key);
      
      // Second payment attempt with same key
      const context2: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: key,
      };
      
      const result2 = canTransition(context2);
      expect(result2.allowed).toBe(false);
      expect(result2.failedGuards).toContain('IDEMPOTENCY_KEY_ALREADY_USED');
    });
  });
});
