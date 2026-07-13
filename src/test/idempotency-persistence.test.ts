import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  consumeIdempotencyKey,
  isIdempotencyKeyConsumed,
  isIdempotencyKeyConsumedPersistent,
  recordIdempotencyKeyConsumptionPersistent,
  clearIdempotencyKeysForDev,
  canTransition,
  type TransitionContext,
} from '@/engine/state-machine';
import { setupIntegrationContext, type IntegrationContext } from './integration-helpers';

let ctx: IntegrationContext;

describe('Idempotency — Persistence', () => {
  beforeAll(async () => {
    ctx = await setupIntegrationContext({ suite: 'idempotency-persistence' });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  beforeEach(() => {
    clearIdempotencyKeysForDev();
  });

  afterEach(() => {
    clearIdempotencyKeysForDev();
  });

  describe('In-Memory Key Consumption', () => {
    it('consumes key on first use', () => {
      const key = 'idem_test_001';
      const result = consumeIdempotencyKey(key);
      expect(result).toBe(true);
    });

    it('rejects key on second use', () => {
      const key = 'idem_test_001';
      consumeIdempotencyKey(key);
      const result = consumeIdempotencyKey(key);
      expect(result).toBe(false);
    });

    it('tracks consumed keys', () => {
      const key = 'idem_test_001';
      expect(isIdempotencyKeyConsumed(key)).toBe(false);
      
      consumeIdempotencyKey(key);
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
    });

    it('rejects empty keys', () => {
      const result = consumeIdempotencyKey('');
      expect(result).toBe(false);
    });
  });

  describe('Persistent Key Recording', () => {
    it('records key consumption to DB', async () => {
      const key = 'idem_persistent_001';
      const claimId = 'CLM-001';
      const actor = 'payment-service';
      
      await recordIdempotencyKeyConsumptionPersistent(key, claimId, actor);
      
      // After recording, in-memory cache should also have it
      expect(isIdempotencyKeyConsumed(key)).toBe(true);
    });

    it('checks persistent storage for consumed key', async () => {
      const key = 'idem_persistent_002';
      
      // First check should be false (not consumed)
      let isConsumed = await isIdempotencyKeyConsumedPersistent(key);
      expect(isConsumed).toBe(false);
      
      // Record the key
      await recordIdempotencyKeyConsumptionPersistent(key, 'CLM-002', 'system');
      
      // Second check should be true (consumed)
      isConsumed = await isIdempotencyKeyConsumedPersistent(key);
      expect(isConsumed).toBe(true);
    });
  });

  describe('Payment Transition Protection', () => {
    it('rejects payment transition without idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: '',
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(false);
      expect(result.failedGuards).toContain('REQUIRE_IDEMPOTENCY_KEY');
    });

    it('allows payment transition with fresh key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: 'idem_fresh_123',
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('rejects payment transition with consumed key', () => {
      const key = 'idem_consumed_123';
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

    it('protects both payment transitions', () => {
      const key1 = 'idem_step1_001';
      const key2 = 'idem_step2_002';
      
      // First transition: ADJUDICATED → PAYMENT_IN_PROGRESS
      const result1 = canTransition({
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: key1,
      });
      expect(result1.allowed).toBe(true);
      
      // Second transition: PAYMENT_IN_PROGRESS → PAID
      const result2 = canTransition({
        claimId: 'CLM-001',
        currentStatus: 'PAYMENT_IN_PROGRESS',
        targetStatus: 'PAID',
        idempotencyKey: key2,
      });
      expect(result2.allowed).toBe(true);
      
      // Replay with same keys should fail
      consumeIdempotencyKey(key1);
      
      const replay = canTransition({
        claimId: 'CLM-001',
        currentStatus: 'ADJUDICATED',
        targetStatus: 'PAYMENT_IN_PROGRESS',
        idempotencyKey: key1,
      });
      expect(replay.allowed).toBe(false);
    });
  });

  describe('Non-Payment Transitions', () => {
    it('do not require idempotency key', () => {
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'RECEIVED',
        targetStatus: 'ELIGIBILITY_CHECK',
        idempotencyKey: undefined,
      };
      
      const result = canTransition(context);
      expect(result.allowed).toBe(true);
    });

    it('do not consume idempotency keys', () => {
      const key = 'idem_non_payment';
      
      const context: TransitionContext = {
        claimId: 'CLM-001',
        currentStatus: 'IN_ADJUDICATION',
        targetStatus: 'ADJUDICATED',
        idempotencyKey: key,
      };
      
      canTransition(context);
      
      // Key should NOT be consumed
      expect(isIdempotencyKeyConsumed(key)).toBe(false);
    });
  });

  describe('Key Isolation', () => {
    it('different keys tracked separately', () => {
      const key1 = 'idem_key_1';
      const key2 = 'idem_key_2';
      
      consumeIdempotencyKey(key1);
      
      expect(isIdempotencyKeyConsumed(key1)).toBe(true);
      expect(isIdempotencyKeyConsumed(key2)).toBe(false);
    });

    it('clearing removes all keys', () => {
      const key1 = 'idem_key_1';
      const key2 = 'idem_key_2';
      
      consumeIdempotencyKey(key1);
      consumeIdempotencyKey(key2);
      
      expect(isIdempotencyKeyConsumed(key1)).toBe(true);
      expect(isIdempotencyKeyConsumed(key2)).toBe(true);
      
      clearIdempotencyKeysForDev();
      
      expect(isIdempotencyKeyConsumed(key1)).toBe(false);
      expect(isIdempotencyKeyConsumed(key2)).toBe(false);
    });
  });

  describe('Multiple Claims', () => {
    it('tracks keys per claim', async () => {
      const key1 = 'idem_clm_001_payment';
      const key2 = 'idem_clm_002_payment';
      
      await recordIdempotencyKeyConsumptionPersistent(key1, 'CLM-001', 'system');
      await recordIdempotencyKeyConsumptionPersistent(key2, 'CLM-002', 'system');
      
      expect(isIdempotencyKeyConsumed(key1)).toBe(true);
      expect(isIdempotencyKeyConsumed(key2)).toBe(true);
    });
  });
});
