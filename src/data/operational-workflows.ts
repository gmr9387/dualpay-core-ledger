/**
 * Operational Workflows — Phase 3A Foundation
 *
 * Persistence layer for:
 * - Assignment workflow (assign, reassign, update priority/due date)
 * - Appeal lifecycle (log appeal events via ops_events)
 * - Recovery actions (log recovery transactions via ops_events)
 * - Claim notes (log notes via ops_events)
 * - Timeline queries (unified chronological history)
 *
 * Leverages:
 * - claim_assignments (extended with assigned_to_user_id, priority, due_date)
 * - ops_events (append-only audit trail with standardized kinds)
 * - recovery_outcomes (final recovery result)
 *
 * No new tables. All workflow history tracked in ops_events.
 */

import { supabase } from '@/integrations/supabase/client';
const uuidv4 = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;

// =========================================================
// Types
// =========================================================

export interface ClaimAssignmentRecord {
  claim_id: string;
  assigned_to_user_id?: string;
  assigned_by_user_id?: string;
  assigned_at: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  /** ISO timestamp; required when status = 'snoozed'. */
  snooze_until?: string;
  status: 'open' | 'in_progress' | 'snoozed' | 'resolved';
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  event_id: string;
  occurred_at: string;
  kind: string;
  claim_id: string;
  actor: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
}

export interface WorklistItem {
  claim_id: string;
  total_billed_cents: number;
  assigned_to_user_id?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  status: 'open' | 'in_progress' | 'snoozed' | 'resolved';
  assigned_at: string;
  days_until_due?: number;
  is_overdue: boolean;
}

// =========================================================
// Assignment Workflow
// =========================================================

/**
 * Create or update a claim assignment.
 *
 * H-6: Uses (claim_id, org_id) composite conflict key for multi-tenant safety.
 * H-3: snooze_until is required when status = 'snoozed'.
 */
export async function updateAssignment(
  claimId: string,
  orgId: string,
  params: {
    assignedToUserId?: string;
    assignedByUserId?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: Date;
    /** H-3: Required when status='snoozed'. */
    snoozeUntil?: Date;
    status?: 'open' | 'in_progress' | 'snoozed' | 'resolved';
  },
): Promise<ClaimAssignmentRecord> {
  const {
    assignedToUserId,
    assignedByUserId,
    priority,
    dueDate,
    snoozeUntil,
    status,
  } = params;

  // H-3: Enforce snooze_until when snoozed.
  if (status === 'snoozed' && !snoozeUntil) {
    throw new Error('snooze_until is required when setting status to snoozed');
  }

  // Get current assignment (if exists) — scoped to org for multi-tenancy.
  const { data: current } = await supabase
    .from('claim_assignments')
    .select('*')
    .eq('claim_id', claimId)
    .eq('org_id', orgId)
    .maybeSingle();

  // Prepare update payload
  const updateData: Record<string, unknown> = {
    org_id: orgId,
  };

  if (priority !== undefined) updateData.priority = priority;
  if (dueDate !== undefined) updateData.due_date = dueDate.toISOString();
  if (snoozeUntil !== undefined) updateData.snooze_until = snoozeUntil.toISOString();
  // Clear snooze_until when un-snoozing.
  if (status !== undefined && status !== 'snoozed') updateData.snooze_until = null;
  if (status !== undefined) updateData.status = status;
  if (assignedToUserId !== undefined) {
    updateData.assigned_to_user_id = assignedToUserId;
  }
  if (assignedByUserId !== undefined) {
    updateData.assigned_by_user_id = assignedByUserId;
  }

  // H-6: Upsert on composite (claim_id, org_id) — multi-tenant safe.
  const { data, error } = await supabase
    .from('claim_assignments')
    .upsert([{
      claim_id: claimId,
      ...updateData,
    }] as never, { onConflict: 'claim_id,org_id' })
    .select()
    .single();

  if (error) throw error;

  // Log assignment event
  const eventKind = current ? 'assignment_updated' : 'assignment_created';
  const summary = current
    ? `Assignment updated: ${priority ? `priority=${priority}` : ''} ${dueDate ? `due=${dueDate.toLocaleDateString()}` : ''} ${status ? `status=${status}` : ''}`
    : `Assigned to ${assignedToUserId || 'unassigned'}`;

  await appendOpsEvent({
    kind: eventKind,
    claimId,
    orgId,
    summary,
    payload: {
      previous_assignee: current?.assigned_to_user_id,
      new_assignee: assignedToUserId,
      previous_priority: current?.priority,
      new_priority: priority,
      previous_due_date: current?.due_date,
      new_due_date: dueDate?.toISOString(),
      previous_status: current?.status,
      new_status: status,
      snooze_until: snoozeUntil?.toISOString(),
      assigned_by: assignedByUserId,
    },
  });

  return data as ClaimAssignmentRecord;
}

// =========================================================
// Notes & Events (ops_events)
// =========================================================

/**
 * Add a note to a claim.
 */
export async function addNote(
  claimId: string,
  orgId: string,
  note: string,
  actor?: string,
): Promise<string> {
  return appendOpsEvent({
    kind: 'note_added',
    claimId,
    orgId,
    summary: `Note added: ${note.substring(0, 100)}`,
    payload: { note },
    actor,
  });
}

/**
 * Log an appeal event.
 */
export async function logAppealEvent(
  claimId: string,
  orgId: string,
  params: {
    kind: 'appeal_submitted' | 'appeal_responded' | 'appeal_resolved';
    summary: string;
    appealStatus?: 'pending_response' | 'won' | 'lost' | 'withdrawn';
    payerResponse?: string;
    notes?: string;
  },
): Promise<string> {
  // M-1: Appeal state transition guard.
  // Fetch the latest appeal event for this claim to validate the transition.
  const { data: latestEvents } = await supabase
    .from('ops_events')
    .select('kind')
    .eq('claim_id', claimId)
    .eq('org_id', orgId)
    .in('kind', ['appeal_submitted', 'appeal_responded', 'appeal_resolved'])
    .order('occurred_at', { ascending: false })
    .limit(1);

  const latestKind = latestEvents?.[0]?.kind as string | undefined;

  const VALID_TRANSITIONS: Record<string, string[]> = {
    // No prior appeal: can submit
    undefined: ['appeal_submitted'],
    appeal_submitted: ['appeal_responded', 'appeal_resolved'],
    appeal_responded: ['appeal_resolved', 'appeal_submitted'], // re-submit on new level
    appeal_resolved: ['appeal_submitted'], // new appeal level allowed
  };

  const allowed = VALID_TRANSITIONS[latestKind ?? 'undefined'] ?? ['appeal_submitted'];
  if (!allowed.includes(params.kind)) {
    throw new Error(
      `Invalid appeal transition: cannot ${params.kind} when latest event is ${latestKind ?? 'none'}. ` +
      `Allowed: ${allowed.join(', ')}`,
    );
  }

  return appendOpsEvent({
    kind: params.kind,
    claimId,
    orgId,
    summary: params.summary,
    payload: {
      appeal_status: params.appealStatus,
      payer_response: params.payerResponse,
      notes: params.notes,
    },
  });
}

/**
 * Log a recovery transaction.
 *
 * B-5 (Phase 3D): When totalBilledCents is not supplied, it is automatically
 * fetched from the claims table so the cap and auto-close logic always fires.
 *
 * B-4 (Phase 3D): Cap math is reversal-aware:
 *   effectiveRecovered = SUM(recovery_recorded.amount_cents)
 *                       − SUM(recovery_reversed.amount_cents)
 * This allows a previously recorded recovery to be unwound via
 * logRecoveryReversal() without permanently blocking future recovery up to
 * the full billed amount.
 *
 * H-2/H-4: Does NOT accept 'writeoff' as a recovery type — write-offs are
 * logged separately via logWriteOff() which requires elevated role checks.
 * M-6: Automatically closes the assignment when claim is fully recovered.
 */
export async function logRecoveryEvent(
  claimId: string,
  orgId: string,
  params: {
    recoveryType: 'payer_payment' | 'patient_payment' | 'adjustment';
    amountCents: number;
    recoveredFrom: string;
    analystUserId?: string;
    notes?: string;
    /**
     * Total billed/denied amount for this claim (cents).
     * B-5: If omitted, fetched from the claims table automatically so the cap
     * and auto-close logic always runs.
     */
    totalBilledCents?: number;
  },
): Promise<string> {
  // B-5: Resolve totalBilledCents — fetch from DB when not supplied.
  let totalBilledCents = params.totalBilledCents;
  if (totalBilledCents === undefined || totalBilledCents <= 0) {
    const { data: claimRow } = await supabase
      .from('claims')
      .select('total_billed_cents')
      .eq('claim_id', claimId)
      .maybeSingle();
    totalBilledCents = (claimRow as { total_billed_cents?: number } | null)?.total_billed_cents ?? 0;
  }

  // H-2/H-4 + B-4: Cap recovery at remaining balance (reversal-aware).
  if (totalBilledCents > 0) {
    const { data: priorEvents } = await supabase
      .from('ops_events')
      .select('kind, payload')
      .eq('claim_id', claimId)
      .eq('org_id', orgId)
      .in('kind', ['recovery_recorded', 'recovery_reversed']);

    const alreadyRecoveredCents = (priorEvents ?? []).reduce((sum, e) => {
      const p = e.payload as Record<string, unknown> | null;
      const amt = typeof p?.amount_cents === 'number' ? p.amount_cents : 0;
      // B-4: Reversals reduce the effective recovered amount.
      return e.kind === 'recovery_reversed' ? sum - amt : sum + amt;
    }, 0);

    const remainingCents = totalBilledCents - alreadyRecoveredCents;
    if (params.amountCents > remainingCents) {
      throw new Error(
        `Recovery amount $${(params.amountCents / 100).toFixed(2)} exceeds remaining balance ` +
        `$${(remainingCents / 100).toFixed(2)}. Effective recovered: $${(alreadyRecoveredCents / 100).toFixed(2)}.`,
      );
    }

    // M-6: Auto-close assignment when fully recovered.
    const newTotal = alreadyRecoveredCents + params.amountCents;
    if (newTotal >= totalBilledCents) {
      await supabase
        .from('claim_assignments')
        .update({ status: 'resolved' } as never)
        .eq('claim_id', claimId)
        .eq('org_id', orgId);
    }
  }

  const summary = `Recovery recorded: ${params.recoveryType} of $${(params.amountCents / 100).toFixed(2)} from ${params.recoveredFrom}`;

  return appendOpsEvent({
    kind: 'recovery_recorded',
    claimId,
    orgId,
    summary,
    payload: {
      recovery_type: params.recoveryType,
      amount_cents: params.amountCents,
      recovered_from: params.recoveredFrom,
      analyst_user_id: params.analystUserId,
      notes: params.notes,
    },
  });
}

/**
 * Log a recovery reversal.
 *
 * B-4 (Phase 3D): Records a corrective event when a previously logged recovery
 * must be unwound (e.g. a check bounces, a payment is clawed back, an EDI
 * adjustment credits the payer).
 *
 * Emits a `recovery_reversed` ops_event.  The cap math in logRecoveryEvent
 * treats these as negative amounts, so subsequent recovery attempts up to the
 * full billed balance are permitted again.
 *
 * amountCents should be the gross amount being reversed (positive integer).
 */
export async function logRecoveryReversal(
  claimId: string,
  orgId: string,
  params: {
    amountCents: number;
    reason: string;
    originalEventId?: string;
    analystUserId?: string;
  },
): Promise<string> {
  if (params.amountCents <= 0) {
    throw new Error('amountCents must be a positive integer for a reversal');
  }

  const summary = `Recovery reversed: $${(params.amountCents / 100).toFixed(2)} — ${params.reason}`;

  return appendOpsEvent({
    kind: 'recovery_reversed',
    claimId,
    orgId,
    summary,
    payload: {
      amount_cents: params.amountCents,
      reason: params.reason,
      original_event_id: params.originalEventId ?? null,
      analyst_user_id: params.analystUserId ?? null,
    },
  });
}

/**
 * Log a write-off.
 *
 * C-2/L-1: Records full audit trail — actor_id, actor_role, reason, amount, org_id.
 * M-6: Automatically closes the assignment after write-off.
 */
export async function logWriteOff(
  claimId: string,
  orgId: string,
  reason: string,
  options: {
    actorId: string;
    actorRole: string;
    amountCents?: number;
    actor?: string;
  },
): Promise<string> {
  // M-6: Close the assignment when writing off.
  await supabase
    .from('claim_assignments')
    .update({ status: 'resolved' } as never)
    .eq('claim_id', claimId)
    .eq('org_id', orgId);

  return appendOpsEvent({
    kind: 'claim_written_off',
    claimId,
    orgId,
    summary: `Claim written off by ${options.actor ?? options.actorId}: ${reason}`,
    payload: {
      reason,
      actor_id: options.actorId,
      actor_role: options.actorRole,
      amount_cents: options.amountCents,
      org_id: orgId,
    },
    actor: options.actor,
  });
}

/**
 * Internal: Append to ops_events audit trail.
 */
async function appendOpsEvent(params: {
  kind: string;
  claimId?: string;
  orgId: string;
  summary: string;
  payload?: Record<string, unknown>;
  actor?: string;
}): Promise<string> {
  const eventId = uuidv4();
  const now = new Date().toISOString();

  const { error } = await supabase.from('ops_events').insert([{
    event_id: eventId,
    kind: params.kind,
    claim_id: params.claimId ?? null,
    org_id: params.orgId,
    actor: params.actor ?? null,
    summary: params.summary,
    payload: params.payload ?? null,
    occurred_at: now,
    created_at: now,
  }] as never);

  if (error) throw error;
  return eventId;
}

// =========================================================
// My Worklist Queries
// =========================================================

/**
 * Get all claims assigned to the current user.
 * Includes open, in_progress, and snoozed statuses.
 */
export async function getMyWorklist(
  userId: string,
  orgId: string,
  includeResolved = false,
): Promise<WorklistItem[]> {
  let q = supabase
    .from('claim_assignments')
    .select(`
      claim_id,
      assigned_to_user_id,
      priority,
      due_date,
      status,
      assigned_at,
      claims(total_billed_cents)
    `)
    .eq('assigned_to_user_id', userId)
    .eq('org_id', orgId)
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true });

  if (!includeResolved) {
    q = q.neq('status', 'resolved');
  }

  const { data, error } = await q;
  if (error) throw error;

  const now = new Date();
  return (data ?? []).map((row: any) => {
    const dueDate = row.due_date ? new Date(row.due_date) : null;
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : undefined;

    return {
      claim_id: row.claim_id,
      total_billed_cents: row.claims?.total_billed_cents ?? 0,
      assigned_to_user_id: row.assigned_to_user_id,
      priority: row.priority,
      due_date: row.due_date,
      status: row.status,
      assigned_at: row.assigned_at,
      days_until_due: daysUntilDue,
      is_overdue: dueDate ? dueDate < now : false,
    };
  });
}

/**
 * Get overdue assignments for the current user.
 */
export async function getOverdueClaims(
  userId: string,
  orgId: string,
): Promise<WorklistItem[]> {
  const { data, error } = await supabase
    .from('claim_assignments')
    .select(`
      claim_id,
      assigned_to_user_id,
      priority,
      due_date,
      status,
      assigned_at,
      claims(total_billed_cents)
    `)
    .eq('assigned_to_user_id', userId)
    .eq('org_id', orgId)
    .neq('status', 'resolved')
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true });

  if (error) throw error;

  const now = new Date();
  return (data ?? []).map((row: any) => ({
    claim_id: row.claim_id,
    total_billed_cents: row.claims?.total_billed_cents ?? 0,
    assigned_to_user_id: row.assigned_to_user_id,
    priority: row.priority,
    due_date: row.due_date,
    status: row.status,
    assigned_at: row.assigned_at,
    days_until_due: row.due_date ? Math.ceil((new Date(row.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : undefined,
    is_overdue: true,
  }));
}

/**
 * Get claims due today for the current user.
 */
export async function getDueTodayClaims(
  userId: string,
  orgId: string,
): Promise<WorklistItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data, error } = await supabase
    .from('claim_assignments')
    .select(`
      claim_id,
      assigned_to_user_id,
      priority,
      due_date,
      status,
      assigned_at,
      claims(total_billed_cents)
    `)
    .eq('assigned_to_user_id', userId)
    .eq('org_id', orgId)
    .neq('status', 'resolved')
    .gte('due_date', today.toISOString())
    .lt('due_date', tomorrow.toISOString())
    .order('priority', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    claim_id: row.claim_id,
    total_billed_cents: row.claims?.total_billed_cents ?? 0,
    assigned_to_user_id: row.assigned_to_user_id,
    priority: row.priority,
    due_date: row.due_date,
    status: row.status,
    assigned_at: row.assigned_at,
    days_until_due: 0,
    is_overdue: false,
  }));
}

/**
 * Get high-dollar claims assigned to the current user (above threshold).
 */
export async function getHighDollarClaims(
  userId: string,
  orgId: string,
  minCentsBilled = 500000,
): Promise<WorklistItem[]> {
  const { data, error } = await supabase
    .from('claim_assignments')
    .select(`
      claim_id,
      assigned_to_user_id,
      priority,
      due_date,
      status,
      assigned_at,
      claims(total_billed_cents)
    `)
    .eq('assigned_to_user_id', userId)
    .eq('org_id', orgId)
    .neq('status', 'resolved')
    .gte('claims.total_billed_cents', minCentsBilled)
    .order('claims.total_billed_cents', { ascending: false });

  if (error) throw error;

  const now = new Date();
  return (data ?? []).map((row: any) => {
    const dueDate = row.due_date ? new Date(row.due_date) : null;
    return {
      claim_id: row.claim_id,
      total_billed_cents: row.claims?.total_billed_cents ?? 0,
      assigned_to_user_id: row.assigned_to_user_id,
      priority: row.priority,
      due_date: row.due_date,
      status: row.status,
      assigned_at: row.assigned_at,
      days_until_due: dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : undefined,
      is_overdue: dueDate ? dueDate < now : false,
    };
  });
}

// =========================================================
// Timeline (Unified Claim History)
// =========================================================

/**
 * Get complete chronological timeline for a claim.
 * Includes all ops_events (notes, appeals, recovery, assignments).
 * Ordered oldest → newest.
 */
export async function getClaimTimeline(
  claimId: string,
  orgId: string,
): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from('ops_events')
    .select('*')
    .eq('claim_id', claimId)
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    event_id: row.event_id,
    occurred_at: row.occurred_at,
    kind: row.kind,
    claim_id: row.claim_id,
    actor: row.actor,
    summary: row.summary,
    payload: row.payload ?? null,
  }));
}

/**
 * Get timeline filtered by specific event kinds.
 * Useful for appeal timeline, recovery timeline, note history, etc.
 */
export async function getClaimTimelineByKind(
  claimId: string,
  orgId: string,
  kinds: string[],
): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from('ops_events')
    .select('*')
    .eq('claim_id', claimId)
    .eq('org_id', orgId)
    .in('kind', kinds)
    .order('occurred_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    event_id: row.event_id,
    occurred_at: row.occurred_at,
    kind: row.kind,
    claim_id: row.claim_id,
    actor: row.actor,
    summary: row.summary,
    payload: row.payload ?? null,
  }));
}

/**
 * Get appeal timeline for a claim (all appeal_* events).
 */
export async function getAppealTimeline(
  claimId: string,
  orgId: string,
): Promise<TimelineEvent[]> {
  return getClaimTimelineByKind(
    claimId,
    orgId,
    ['appeal_submitted', 'appeal_responded', 'appeal_resolved'],
  );
}

/**
 * Get recovery timeline for a claim (recovery_recorded and recovery_reversed events).
 * B-4: Includes reversals so callers can compute the net recovered amount.
 */
export async function getRecoveryTimeline(
  claimId: string,
  orgId: string,
): Promise<TimelineEvent[]> {
  return getClaimTimelineByKind(claimId, orgId, ['recovery_recorded', 'recovery_reversed']);
}

/**
 * Get note timeline for a claim (all note_added events).
 */
export async function getNoteTimeline(
  claimId: string,
  orgId: string,
): Promise<TimelineEvent[]> {
  return getClaimTimelineByKind(claimId, orgId, ['note_added']);
}
