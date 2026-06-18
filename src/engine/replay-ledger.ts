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
 */

import { hashObject } from './hash';

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

  details: Record<string, unknown>;
}

const ledger: ReplayLedgerEvent[] = [];

/**
 * Deterministic ledger ID.
 *
 * Same event payload => same ID.
 * Different payload => different ID.
 */
async function createLedgerId(
  event: Omit<ReplayLedgerEvent, 'event_id'>,
): Promise<string> {
  const hash = await hashObject({
    type: event.type,
    claim_id: event.claim_id,
    run_id: event.run_id,
    snapshot_id: event.snapshot_id,
    actor: event.actor,
    timestamp: event.timestamp,
    details: event.details,
  });

  return `ledger_${hash.slice(0, 16)}`;
}

/**
 * Append immutable event.
 */
export async function appendLedgerEvent(
  event: Omit<ReplayLedgerEvent, 'event_id'>,
): Promise<ReplayLedgerEvent> {
  const record: ReplayLedgerEvent = {
    event_id: await createLedgerId(event),
    ...event,
  };

  ledger.push(record);

  return record;
}

/**
 * Entire ledger.
 */
export function listLedgerEvents(): ReplayLedgerEvent[] {
  return [...ledger].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

/**
 * Claim-specific history.
 */
export function listLedgerEventsForClaim(
  claimId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (event) => event.claim_id === claimId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

/**
 * Run-specific history.
 */
export function listLedgerEventsForRun(
  runId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (event) => event.run_id === runId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

/**
 * Snapshot-specific history.
 */
export function listLedgerEventsForSnapshot(
  snapshotId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (event) =>
        event.snapshot_id === snapshotId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

/**
 * Lookup by event id.
 */
export function getLedgerEvent(
  eventId: string,
): ReplayLedgerEvent | undefined {
  return ledger.find(
    (event) => event.event_id === eventId,
  );
}

/**
 * Clear in-memory ledger.
 *
 * Dev/testing only.
 */
export function clearLedger(): void {
  ledger.length = 0;
}