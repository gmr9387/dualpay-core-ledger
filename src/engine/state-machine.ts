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
  check: (ctx) => !!ctx.hasIdempotencyKey,
};

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

  return {
    allowed: failedGuards.length === 0,
    fromStatus: context.currentStatus,
    toStatus: context.targetStatus,
    failedGuards,
    appliedGuards,
    idempotencyKey: context.hasIdempotencyKey
      ? `idem-${context.claimId}-${context.currentStatus}-${context.targetStatus}`
      : undefined,
  };
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