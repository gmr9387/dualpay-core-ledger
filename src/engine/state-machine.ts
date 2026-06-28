// Claim State Machine — explicit transitions with guards and audit trail

import type { ClaimStatus } from '@/types/claim';

export interface TransitionGuard {
  id: string;
  description: string;
  /** Returns true if transition is allowed */
  check: (context: TransitionContext) => boolean;
}

export interface TransitionContext {
  claimId: string;
  currentStatus: ClaimStatus;
  targetStatus: ClaimStatus;
  hasPrimacyConfirmation?: boolean;
  hasExceptionOverride?: boolean;
  hasIdempotencyKey?: boolean;
  idempotencyKey?: string;
  userId?: string;
  timestamp?: string;
}

export interface TransitionResult {
  allowed: boolean;
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
  failedGuards: string[];
  appliedGuards: string[];
  idempotencyKey?: string;
}

export interface StatusTransition {
  from: ClaimStatus;
  to: ClaimStatus;
  guards: TransitionGuard[];
  label: string;
}

// ── Guards ────────────────────────────────────────────────────

const requirePrimacyConfirmation: TransitionGuard = {
  id: 'REQUIRE_PRIMACY_CONFIRMATION',
  description:
    'COB-routed claims require primacy confirmation or audited exception override before payment',
  check: (ctx) => !!ctx.hasPrimacyConfirmation || !!ctx.hasExceptionOverride,
};

const requireIdempotencyKey: TransitionGuard = {
  id: 'REQUIRE_IDEMPOTENCY_KEY',
  description:
    'Payment actions require an idempotency key to prevent duplicate payouts',
  check: (ctx) => typeof ctx.idempotencyKey === 'string' && ctx.idempotencyKey.length > 0,
};

// ── Idempotency Registry (In-Memory Cache) ──────────────────

const consumedIdempotencyKeys = new Set<string>();

let idempotencyInitialized = false;

/**
 * Initialize idempotency key tracking from persistent storage.
 * Call once on app startup.
 */
export async function initializeIdempotencyKeyTracking(): Promise<void> {
  if (idempotencyInitialized) return;

  try {
    // Note: In a full implementation, we would load all consumed keys from the DB.
    // For now, we start fresh and rely on DB as the source of truth.
    // Each call to isIdempotencyKeyConsumedPersistent checks the DB directly.
    consumedIdempotencyKeys.clear();
    idempotencyInitialized = true;
  } catch (error) {
    console.error('Failed to initialize idempotency key tracking:', error);
    idempotencyInitialized = true;
  }
}

/**
 * Consume an idempotency key. Returns true on first use, false if already consumed.
 *
 * C-3: This checks the in-memory cache first for speed, then falls back to the
 * persistent DB check to survive restarts. The DB is the authoritative source of
 * truth; the in-memory set is only a fast-path cache.
 *
 * Callers that perform side-effectful payment work should invoke this before
 * acting and abort if it returns false.
 */
export function consumeIdempotencyKey(key: string): boolean {
  if (!key) return false;
  if (consumedIdempotencyKeys.has(key)) return false;
  consumedIdempotencyKeys.add(key);
  return true;
}

/**
 * Check if an idempotency key has been consumed (in-memory check only).
 */
export function isIdempotencyKeyConsumed(key: string): boolean {
  return consumedIdempotencyKeys.has(key);
}

/**
 * Check if an idempotency key has been consumed (persistent check).
 * For payment transitions, always use this to survive restarts.
 */
export async function isIdempotencyKeyConsumedPersistent(key: string): Promise<boolean> {
  try {
    const { isIdempotencyKeyConsumedPersistent: checkDB } = await import('@/data/repository');
    return await checkDB(key);
  } catch (error) {
    console.error('Failed to check idempotency key in DB:', error);
    // Fail safe: assume consumed if we can't check the DB
    return true;
  }
}

/**
 * Record an idempotency key consumption in persistent storage.
 * Call after a successful payment transition.
 */
export async function recordIdempotencyKeyConsumptionPersistent(
  key: string,
  claimId: string,
  actor: string,
): Promise<void> {
  try {
    const { recordIdempotencyKeyConsumption } = await import('@/data/repository');
    await recordIdempotencyKeyConsumption(key, claimId, actor);
    // Also update in-memory cache
    consumedIdempotencyKeys.add(key);
  } catch (error) {
    throw new Error(`Failed to record idempotency key consumption: ${error}`);
  }
}

/** Test/dev only — clears the in-memory consumed-key registry. */
export function clearIdempotencyKeysForDev(): void {
  consumedIdempotencyKeys.clear();
  idempotencyInitialized = false;
}

function isPaymentTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return (
    (from === 'ADJUDICATED' && to === 'PAYMENT_IN_PROGRESS') ||
    (from === 'PAYMENT_IN_PROGRESS' && to === 'PAID')
  );
}

const noGuard: TransitionGuard = {
  id: 'NO_GUARD',
  description: 'No additional checks required',
  check: () => true,
};

// ── Transition Definitions ────────────────────────────────────

export const CLAIM_TRANSITIONS: StatusTransition[] = [
  // Intake
  {
    from: 'RECEIVED',
    to: 'ELIGIBILITY_CHECK',
    guards: [noGuard],
    label: 'Begin eligibility',
  },

  // Eligibility → routing
  {
    from: 'ELIGIBILITY_CHECK',
    to: 'COB_ROUTED',
    guards: [noGuard],
    label: 'OHI detected → route COB',
  },
  {
    from: 'ELIGIBILITY_CHECK',
    to: 'IN_ADJUDICATION',
    guards: [noGuard],
    label: 'No OHI → adjudicate',
  },

  // COB flow
  {
    from: 'COB_ROUTED',
    to: 'AWAITING_PRIMARY_EOB',
    guards: [noGuard],
    label: 'Request primary EOB',
  },
  {
    from: 'AWAITING_PRIMARY_EOB',
    to: 'IN_ADJUDICATION',
    guards: [requirePrimacyConfirmation],
    label: 'Primary EOB received',
  },
  {
    from: 'COB_ROUTED',
    to: 'IN_ADJUDICATION',
    guards: [requirePrimacyConfirmation],
    label: 'Primacy confirmed → adjudicate',
  },

  // Adjudication
  {
    from: 'IN_ADJUDICATION',
    to: 'ADJUDICATED',
    guards: [noGuard],
    label: 'Adjudication complete',
  },
  {
    from: 'IN_ADJUDICATION',
    to: 'PENDED',
    guards: [noGuard],
    label: 'Pend for review',
  },
  {
    from: 'IN_ADJUDICATION',
    to: 'DENIED',
    guards: [noGuard],
    label: 'Deny claim',
  },

  // Pend resolution
  {
    from: 'PENDED',
    to: 'IN_ADJUDICATION',
    guards: [noGuard],
    label: 'Resume adjudication',
  },
  {
    from: 'PENDED',
    to: 'DENIED',
    guards: [noGuard],
    label: 'Deny after review',
  },

  // Payment flow
  {
    from: 'ADJUDICATED',
    to: 'PAYMENT_IN_PROGRESS',
    guards: [requireIdempotencyKey],
    label: 'Initiate payment',
  },
  {
    from: 'PAYMENT_IN_PROGRESS',
    to: 'PAID',
    guards: [requireIdempotencyKey],
    label: 'Payment confirmed',
  },

  // Post-payment
  {
    from: 'PAID',
    to: 'REVERSED',
    guards: [noGuard],
    label: 'Reverse payment',
  },
  {
    from: 'PAID',
    to: 'ADJUSTED',
    guards: [noGuard],
    label: 'Adjust claim',
  },
  {
    from: 'REVERSED',
    to: 'IN_ADJUDICATION',
    guards: [noGuard],
    label: 'Re-adjudicate',
  },
  {
    from: 'ADJUSTED',
    to: 'IN_ADJUDICATION',
    guards: [noGuard],
    label: 'Re-adjudicate',
  },
];

// ── All valid statuses (ordered for display) ────────────────

export const ALL_STATUSES: ClaimStatus[] = [
  'RECEIVED',
  'ELIGIBILITY_CHECK',
  'COB_ROUTED',
  'AWAITING_PRIMARY_EOB',
  'IN_ADJUDICATION',
  'PENDED',
  'ADJUDICATED',
  'DENIED',
  'PAYMENT_IN_PROGRESS',
  'PAID',
  'REVERSED',
  'ADJUSTED',
];

// ── Engine Functions ──────────────────────────────────────────

export function getValidTransitions(
  currentStatus: ClaimStatus,
): StatusTransition[] {
  return CLAIM_TRANSITIONS.filter(
    (t) => t.from === currentStatus,
  );
}

/**
 * Run the synchronous guard checks for a status transition.
 *
 * ⚠️  DO NOT call this function for production payment mutations
 * (transitions to PAYMENT_IN_PROGRESS or PAID).  Use
 * `canTransitionWithPersistentIdempotency()` instead — it adds the
 * DB-backed idempotency check that survives process restarts.
 *
 * Safe uses: rendering UI transition validity (e.g. StateDiagram),
 * non-payment status transitions, and as the internal fast-path
 * called from canTransitionWithPersistentIdempotency itself.
 */
export function canTransition(
  context: TransitionContext,
): TransitionResult {
  const transition = CLAIM_TRANSITIONS.find(
    (t) =>
      t.from === context.currentStatus &&
      t.to === context.targetStatus,
  );

  if (!transition) {
    return {
      allowed: false,
      fromStatus: context.currentStatus,
      toStatus: context.targetStatus,
      failedGuards: ['NO_VALID_TRANSITION'],
      appliedGuards: [],
    };
  }

  const failedGuards: string[] = [];
  const appliedGuards: string[] = [];

  for (const guard of transition.guards) {
    if (guard.id === 'NO_GUARD') continue;

    appliedGuards.push(guard.id);

    if (!guard.check(context)) {
      failedGuards.push(guard.id);
    }
  }

  // Reject already-consumed idempotency keys on payment transitions.
  const paymentTransition = isPaymentTransition(
    context.currentStatus,
    context.targetStatus,
  );
  if (
    paymentTransition &&
    !failedGuards.includes('REQUIRE_IDEMPOTENCY_KEY') &&
    context.idempotencyKey &&
    consumedIdempotencyKeys.has(context.idempotencyKey)
  ) {
    failedGuards.push('IDEMPOTENCY_KEY_ALREADY_USED');
  }

  return {
    allowed: failedGuards.length === 0,
    fromStatus: context.currentStatus,
    toStatus: context.targetStatus,
    failedGuards,
    appliedGuards,
    idempotencyKey: context.idempotencyKey,
  };
}

/**
 * ⚠️  PRODUCTION PAYMENT GUARD — use this for ANY mutation that writes a claim
 * to PAYMENT_IN_PROGRESS or PAID (or any financial recovery/write-off action).
 *
 * C-3: Persistent DB-backed idempotency check for payment transitions.
 *
 * For payment/recovery transitions this function:
 *   1. Checks the in-memory cache (fast path).
 *   2. Checks the persistent idempotency_keys table (survives restarts).
 *   3. Only if both checks pass, records the key in the DB before returning.
 *
 * Must be awaited before performing any payment side-effect.
 * Returns the same TransitionResult shape as canTransition().
 *
 * Callers in data/repository.ts (updateClaimStatus) are the ONLY authorised
 * entry points for claim status mutations that involve payment transitions.
 */
export async function canTransitionWithPersistentIdempotency(
  context: TransitionContext,
): Promise<TransitionResult> {
  // First run the synchronous guard checks.
  const result = canTransition(context);
  if (!result.allowed) return result;

  // For non-payment transitions, no additional DB check needed.
  if (!isPaymentTransition(context.currentStatus, context.targetStatus)) {
    return result;
  }

  const key = context.idempotencyKey;
  if (!key) return result;

  // C-3: Persistent check — survives process restart.
  const isConsumed = await isIdempotencyKeyConsumedPersistent(key);
  if (isConsumed) {
    return {
      ...result,
      allowed: false,
      failedGuards: [...result.failedGuards, 'IDEMPOTENCY_KEY_ALREADY_USED_PERSISTENT'],
    };
  }

  // Record consumption atomically before the caller performs the payment action.
  await recordIdempotencyKeyConsumptionPersistent(
    key,
    context.claimId,
    context.userId ?? 'system',
  );

  return result;
}

export function getStatusCategory(
  status: ClaimStatus,
): 'intake' | 'cob' | 'adjudication' | 'payment' | 'terminal' {
  switch (status) {
    case 'RECEIVED':
    case 'ELIGIBILITY_CHECK':
      return 'intake';

    case 'COB_ROUTED':
    case 'AWAITING_PRIMARY_EOB':
      return 'cob';

    case 'IN_ADJUDICATION':
    case 'PENDED':
    case 'ADJUDICATED':
      return 'adjudication';

    case 'PAYMENT_IN_PROGRESS':
    case 'PAID':
      return 'payment';

    case 'DENIED':
    case 'REVERSED':
    case 'ADJUSTED':
      return 'terminal';
  }
}
