/**
 * Replay Ledger
 *
 * Immutable audit history of:
 * - Original adjudications
 * - Replays
 * - Verification events
 *
 * Think:
 * "What happened?"
 * "When?"
 * "Who triggered it?"
 * "Did it match?"
 */

export type ReplayLedgerEventType =
  | 'ADJUDICATION_CREATED'
  | 'SNAPSHOT_CREATED'
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

let ledgerCounter = 0;

function nextLedgerId(): string {
  ledgerCounter += 1;

  return `ledger_${String(
    ledgerCounter,
  ).padStart(8, '0')}`;
}

export function appendLedgerEvent(
  event: Omit<ReplayLedgerEvent, 'event_id'>,
): ReplayLedgerEvent {
  const record: ReplayLedgerEvent = {
    event_id: nextLedgerId(),
    ...event,
  };

  ledger.push(record);

  return record;
}

export function listLedgerEvents(): ReplayLedgerEvent[] {
  return [...ledger].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

export function listLedgerEventsForClaim(
  claimId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (e) => e.claim_id === claimId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function listLedgerEventsForRun(
  runId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (e) => e.run_id === runId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function listLedgerEventsForSnapshot(
  snapshotId: string,
): ReplayLedgerEvent[] {
  return ledger
    .filter(
      (e) =>
        e.snapshot_id === snapshotId,
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
}

export function clearLedger(): void {
  ledger.length = 0;
}