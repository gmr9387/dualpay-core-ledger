/**
 * Onboarding Work Queue Configuration
 *
 * Stores the initial queue setup chosen during the onboarding wizard Step 4.
 * Persisted in localStorage per organization so it survives page reloads.
 * The actual claim-to-queue assignment is still performed by deriveQueues()
 * in the denial-intelligence engine; this config controls which queues are
 * activated and their assigned workflow owner.
 */

import type { WorkQueueId, WorkflowOwner } from '@/types/clarity';

/** Canonical display order for work queues — mirrors the order in WorkQueues.tsx. */
export const QUEUE_ORDER: WorkQueueId[] = [
  'unresolved_denials',
  'high_value',
  'appeals_in_progress',
  'escalation',
  'missing_docs',
  'aging',
  'stalled',
  'payer_follow_up',
];

const STORAGE_KEY_PREFIX = 'clarity:queue_config';

// ── Types ─────────────────────────────────────────────────────

export interface QueueEntry {
  /** Whether this queue is active (shown in Work Queues page and dashboards). */
  enabled: boolean;
  /** Default workflow owner for items in this queue. */
  owner: WorkflowOwner;
  /** Relative priority among queues. */
  priority: 'high' | 'medium' | 'low';
}

export type QueueConfigMap = Record<WorkQueueId, QueueEntry>;

// ── Defaults ──────────────────────────────────────────────────

const DEFAULT_OWNER_BY_QUEUE: Record<WorkQueueId, WorkflowOwner> = {
  unresolved_denials: 'biller',
  high_value:         'appeals',
  appeals_in_progress:'appeals',
  missing_docs:       'coder',
  stalled:            'biller',
  escalation:         'appeals',
  aging:              'biller',
  payer_follow_up:    'biller',
};

const DEFAULT_PRIORITY_BY_QUEUE: Record<WorkQueueId, QueueEntry['priority']> = {
  unresolved_denials: 'high',
  high_value:         'high',
  appeals_in_progress:'high',
  missing_docs:       'medium',
  stalled:            'medium',
  escalation:         'high',
  aging:              'low',
  payer_follow_up:    'medium',
};

/** Returns a fresh default config with all queues enabled. */
export function createDefaultQueueConfig(): QueueConfigMap {
  return Object.fromEntries(
    QUEUE_ORDER.map((q) => [
      q,
      {
        enabled: true,
        owner: DEFAULT_OWNER_BY_QUEUE[q],
        priority: DEFAULT_PRIORITY_BY_QUEUE[q],
      } satisfies QueueEntry,
    ]),
  ) as QueueConfigMap;
}

// ── Persistence ───────────────────────────────────────────────

function storageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}:${orgId}`;
}

/**
 * Persist the queue configuration for the given org.
 * Returns true on success, false if storage is unavailable.
 */
export function saveQueueConfig(orgId: string, config: QueueConfigMap): boolean {
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the persisted queue configuration for the given org.
 * Returns null if none has been saved yet.
 */
export function loadQueueConfig(orgId: string): QueueConfigMap | null {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw) as QueueConfigMap;
  } catch {
    return null;
  }
}

/**
 * Returns the saved config if one exists, otherwise the default config.
 */
export function getOrDefaultQueueConfig(orgId: string): QueueConfigMap {
  return loadQueueConfig(orgId) ?? createDefaultQueueConfig();
}

/** True when the given org has completed queue setup. */
export function hasQueueConfig(orgId: string): boolean {
  return loadQueueConfig(orgId) !== null;
}

// ── Onboarding completion flag ─────────────────────────────────

const ONBOARDING_KEY_PREFIX = 'clarity:onboarding_done';

export function markOnboardingComplete(orgId: string): void {
  try {
    localStorage.setItem(`${ONBOARDING_KEY_PREFIX}:${orgId}`, '1');
  } catch {
    // ignore storage errors
  }
}

export function isOnboardingComplete(orgId: string): boolean {
  try {
    return localStorage.getItem(`${ONBOARDING_KEY_PREFIX}:${orgId}`) === '1';
  } catch {
    return false;
  }
}
