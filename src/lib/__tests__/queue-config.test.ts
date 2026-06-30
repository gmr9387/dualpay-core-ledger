/**
 * Tests for src/lib/queue-config.ts
 *
 * Covers: createDefaultQueueConfig, save/load/hasQueueConfig,
 * getOrDefaultQueueConfig, onboarding completion flag,
 * and QUEUE_ORDER completeness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QUEUE_ORDER,
  createDefaultQueueConfig,
  saveQueueConfig,
  loadQueueConfig,
  getOrDefaultQueueConfig,
  hasQueueConfig,
  markOnboardingComplete,
  isOnboardingComplete,
  type QueueConfigMap,
} from '@/lib/queue-config';
import type { WorkQueueId } from '@/types/clarity';

const ORG_A = 'org-test-a';
const ORG_B = 'org-test-b';

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear();
});

// ── QUEUE_ORDER ────────────────────────────────────────────────

describe('QUEUE_ORDER', () => {
  it('contains exactly 8 queues', () => {
    expect(QUEUE_ORDER).toHaveLength(8);
  });

  it('contains all expected WorkQueueId values', () => {
    const expected: WorkQueueId[] = [
      'unresolved_denials',
      'high_value',
      'appeals_in_progress',
      'escalation',
      'missing_docs',
      'aging',
      'stalled',
      'payer_follow_up',
    ];
    expect(new Set(QUEUE_ORDER)).toEqual(new Set(expected));
  });

  it('has no duplicate entries', () => {
    expect(new Set(QUEUE_ORDER).size).toBe(QUEUE_ORDER.length);
  });
});

// ── createDefaultQueueConfig ─────────────────────────────────────────

describe('createDefaultQueueConfig', () => {
  it('returns an entry for every queue in QUEUE_ORDER', () => {
    const config = createDefaultQueueConfig();
    for (const q of QUEUE_ORDER) {
      expect(config[q]).toBeDefined();
    }
  });

  it('enables all queues by default', () => {
    const config = createDefaultQueueConfig();
    for (const q of QUEUE_ORDER) {
      expect(config[q].enabled).toBe(true);
    }
  });

  it('assigns a valid WorkflowOwner to every queue', () => {
    const validOwners = [
      'biller', 'coder', 'auth_team', 'clinical',
      'appeals', 'cob_team', 'eligibility', 'unassigned',
    ];
    const config = createDefaultQueueConfig();
    for (const q of QUEUE_ORDER) {
      expect(validOwners).toContain(config[q].owner);
    }
  });

  it('assigns a valid priority to every queue', () => {
    const config = createDefaultQueueConfig();
    for (const q of QUEUE_ORDER) {
      expect(['high', 'medium', 'low']).toContain(config[q].priority);
    }
  });

  it('returns a new object on each call (no shared reference)', () => {
    const a = createDefaultQueueConfig();
    const b = createDefaultQueueConfig();
    a.high_value.enabled = false;
    expect(b.high_value.enabled).toBe(true);
  });
});

// ── saveQueueConfig / loadQueueConfig ──────────────────────────

describe('saveQueueConfig + loadQueueConfig', () => {
  it('round-trips the full config correctly', () => {
    const config = createDefaultQueueConfig();
    config.high_value.enabled = false;
    config.high_value.owner = 'coder';
    config.high_value.priority = 'low';

    saveQueueConfig(ORG_A, config);
    const loaded = loadQueueConfig(ORG_A);

    expect(loaded).not.toBeNull();
    expect(loaded!.high_value.enabled).toBe(false);
    expect(loaded!.high_value.owner).toBe('coder');
    expect(loaded!.high_value.priority).toBe('low');
  });

  it('returns true on successful save', () => {
    const ok = saveQueueConfig(ORG_A, createDefaultQueueConfig());
    expect(ok).toBe(true);
  });

  it('returns null when no config has been saved', () => {
    expect(loadQueueConfig(ORG_B)).toBeNull();
  });

  it('isolates configs by orgId', () => {
    const cfgA = createDefaultQueueConfig();
    cfgA.aging.enabled = false;
    const cfgB = createDefaultQueueConfig();
    cfgB.stalled.owner = 'coder';

    saveQueueConfig(ORG_A, cfgA);
    saveQueueConfig(ORG_B, cfgB);

    expect(loadQueueConfig(ORG_A)!.aging.enabled).toBe(false);
    expect(loadQueueConfig(ORG_A)!.stalled.owner).not.toBe('coder');

    expect(loadQueueConfig(ORG_B)!.stalled.owner).toBe('coder');
    expect(loadQueueConfig(ORG_B)!.aging.enabled).toBe(true);
  });

  it('overwrites an existing config on re-save', () => {
    const config = createDefaultQueueConfig();
    saveQueueConfig(ORG_A, config);

    const updated = createDefaultQueueConfig();
    updated.escalation.owner = 'coder';
    saveQueueConfig(ORG_A, updated);

    expect(loadQueueConfig(ORG_A)!.escalation.owner).toBe('coder');
  });
});

// ── hasQueueConfig ─────────────────────────────────────────────

describe('hasQueueConfig', () => {
  it('returns false before any config is saved', () => {
    expect(hasQueueConfig(ORG_A)).toBe(false);
  });

  it('returns true after config is saved', () => {
    saveQueueConfig(ORG_A, createDefaultQueueConfig());
    expect(hasQueueConfig(ORG_A)).toBe(true);
  });

  it('is independent across orgs', () => {
    saveQueueConfig(ORG_A, createDefaultQueueConfig());
    expect(hasQueueConfig(ORG_B)).toBe(false);
  });
});

// ── getOrDefaultQueueConfig ────────────────────────────────────

describe('getOrDefaultQueueConfig', () => {
  it('returns default config when none saved', () => {
    const result = getOrDefaultQueueConfig(ORG_A);
    const def = createDefaultQueueConfig();
    for (const q of QUEUE_ORDER) {
      expect(result[q].enabled).toBe(def[q].enabled);
      expect(result[q].owner).toBe(def[q].owner);
      expect(result[q].priority).toBe(def[q].priority);
    }
  });

  it('returns saved config when one exists', () => {
    const config = createDefaultQueueConfig();
    config.missing_docs.enabled = false;
    saveQueueConfig(ORG_A, config);

    const result = getOrDefaultQueueConfig(ORG_A);
    expect(result.missing_docs.enabled).toBe(false);
  });
});

// ── Onboarding completion flag ─────────────────────────────────

describe('markOnboardingComplete / isOnboardingComplete', () => {
  it('returns false before marking complete', () => {
    expect(isOnboardingComplete(ORG_A)).toBe(false);
  });

  it('returns true after marking complete', () => {
    markOnboardingComplete(ORG_A);
    expect(isOnboardingComplete(ORG_A)).toBe(true);
  });

  it('is independent across orgs', () => {
    markOnboardingComplete(ORG_A);
    expect(isOnboardingComplete(ORG_B)).toBe(false);
  });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => {
      markOnboardingComplete(ORG_A);
      markOnboardingComplete(ORG_A);
    }).not.toThrow();
    expect(isOnboardingComplete(ORG_A)).toBe(true);
  });
});

// ── Config shape integrity ─────────────────────────────────────

describe('QueueConfigMap shape', () => {
  it('saved config preserves all QUEUE_ORDER keys after round-trip', () => {
    saveQueueConfig(ORG_A, createDefaultQueueConfig());
    const loaded = loadQueueConfig(ORG_A) as QueueConfigMap;
    for (const q of QUEUE_ORDER) {
      expect(loaded[q]).toBeDefined();
      expect(typeof loaded[q].enabled).toBe('boolean');
      expect(typeof loaded[q].owner).toBe('string');
      expect(typeof loaded[q].priority).toBe('string');
    }
  });
});
