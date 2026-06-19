/**
 * Replay Ledger
 *
 * Immutable audit history of:
 * - Original adjudications
 * - Replays
 * - Verification events
 * - Fingerprint creation
 * - Replay record persistence
 *
 * Deterministic event IDs.
 * No Date.now().
 * No global counters.
 *
 * Hash-chained events:
 * every event contains:
 * - prev_event_hash
 * - event_hash
 *
 * This makes tampering detectable.
 */

import { hashObject } from './hash';

const GENESIS_HASH = 'GENESIS';

export type ReplayLedgerEventType =
  | 'ADJUDICATION_CREATED'
  | 'SNAPSHOT_CREATED'
  | 'FINGERPRINT_CREATED'
  | 'REPLAY_RECORD_SAVED'
  | 'REPLAY_EXECUTED'
  | 'VERIFICATION_PASSED'
  | 'VERIFICATION_FAILED';

export interface ReplayLedgerEvent {
  event_id: string;

  type: ReplayLedgerEventType;

  claim_id: string;
  run_id?: string;
  snapshot_id?: string;

  actor: string;

  timestamp: string;

  prev_event_hash: string;
  event_hash: string;

  details: Record<string, unknown>;
}

export interface ReplayLedgerIntegrityResult {
  valid: boolean;
  broken_at_event_id?: string;
  expected_prev_hash?: string;
  actual_prev_hash?: string;
  expected_event_hash?: string;
  actual_event_hash?: string;
}

type NewLedgerEvent = Omit<
  ReplayLedgerEvent,
  'event_id' | 'prev_event_hash' | 'event_hash'
>;

const ledger: ReplayLedgerEvent[] = [];

function latestEventHash(): string {
  return ledger.length > 0
    ? ledger[ledger.length - 1].event_hash
    : GENESIS_HASH;
}

async function createEventHash(
  event: NewLedgerEvent,
  prevEventHash: string,
): Promise<string> {
  return hashObject({
    type: event.type,
    claim_id: event.claim_id,
    run_id: event.run_id,
    snapshot_id: event.snapshot_id,
    actor: event.actor,
    timestamp: event.timestamp,
    prev_event_hash: prevEventHash,
    details: event.details,
  });
}

async function createLedgerId(
  eventHash: string,
): Promise<string> {
  return `ledger_${eventHash.slice(0, 16)}`;
}

export async function appendLedgerEvent(
  event: NewLedgerEvent,
): Promise<ReplayLedgerEvent> {
  const prevEventHash = latestEventHash();
  const eventHash = await createEventHash(event, prevEventHash);

  const record: ReplayLedgerEvent = Object.freeze({
    event_id: await createLedgerId(eventHash),
    ...event,
    prev_event_hash: prevEventHash,
    event_hash: eventHash,
  });

  ledger.push(record);

  return record;
}

export function listLedgerEvents(): ReplayLedgerEvent[] {
  return [...ledger].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

export function listLedgerEventsInAppendOrder(): ReplayLedgerEvent[] {
  return [...ledger];
}

export function listLedgerEventsForClaim(
  claimId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter((event) => event.claim_id === claimId)
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function listLedgerEventsForRun(
  runId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter((event) => event.run_id === runId)
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function listLedgerEventsForSnapshot(
  snapshotId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter((event) => event.snapshot_id === snapshotId)
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function getLedgerEvent(
  eventId: string,
): ReplayLedgerEvent | undefined {
  return ledger.find(
    (event) => event.event_id === eventId,
  );
}

export async function verifyLedgerIntegrity(): Promise<ReplayLedgerIntegrityResult> {
  let expectedPrevHash = GENESIS_HASH;

  for (const event of ledger) {
    if (event.prev_event_hash !== expectedPrevHash) {
      return {
        valid: false,
        broken_at_event_id: event.event_id,
        expected_prev_hash: expectedPrevHash,
        actual_prev_hash: event.prev_event_hash,
      };
    }

    const recalculatedEventHash = await createEventHash(
      {
        type: event.type,
        claim_id: event.claim_id,
        run_id: event.run_id,
        snapshot_id: event.snapshot_id,
        actor: event.actor,
        timestamp: event.timestamp,
        details: event.details,
      },
      event.prev_event_hash,
    );

    if (event.event_hash !== recalculatedEventHash) {
      return {
        valid: false,
        broken_at_event_id: event.event_id,
        expected_event_hash: recalculatedEventHash,
        actual_event_hash: event.event_hash,
      };
    }

    expectedPrevHash = event.event_hash;
  }

  return {
    valid: true,
  };
}

/**
 * Test/dev only.
 *
 * Do not call this in production workflows.
 */
export function clearLedger(): void {
  ledger.length = 0;
}