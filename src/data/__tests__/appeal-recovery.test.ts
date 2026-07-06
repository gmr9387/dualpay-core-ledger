import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockRow {
  id: string;
  organization_id: string;
  claim_id: string;
  current_state: string;
  assigned_to_user_id: string | null;
  packet_id: string | null;
  core_trace_id: string | null;
  core_decision_outcome: string | null;
  core_dispatch_status: string | null;
  glue_run_id: string | null;
  payer_response_status: string | null;
  recovered_amount_cents: number | null;
  created_at: string;
  updated_at: string;
}

const table: MockRow[] = [];
let lastOnConflict: string | undefined;

class QueryBuilder {
  private filters: Record<string, unknown> = {};
  private selected: MockRow | null = null;

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  upsert(rows: MockRow[], options?: { onConflict?: string }) {
    lastOnConflict = options?.onConflict;
    for (const row of rows) {
      const idx = table.findIndex((r) => r.organization_id === row.organization_id && r.claim_id === row.claim_id);
      if (idx >= 0) {
        table[idx] = { ...table[idx], ...row };
        this.selected = table[idx];
      } else {
        table.push(row);
        this.selected = row;
      }
    }
    return this;
  }

  async maybeSingle() {
    const found = table.find((row) =>
      Object.entries(this.filters).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
    ) ?? null;
    return { data: found, error: null };
  }

  async single() {
    return { data: this.selected, error: null };
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => new QueryBuilder(),
  },
}));

import {
  APPEAL_RECOVERY_TRANSITIONS,
  canTransitionAppealRecovery,
  generatePacketForRecovery,
  getOrCreateAppealRecoveryCase,
  getRecoveryStepLabel,
  isTerminalAppealRecoveryState,
  launchApprovalWorkflowForRecovery,
  markLostOutcome,
  markSubmittedManually,
  recordPayerResponseForRecovery,
  requestReviewForRecovery,
  runCoreDecisionForRecovery,
  transitionAppealRecoveryCase,
  writeOffOutcome,
  recordRecoveryOutcome,
} from '../appeal-recovery';

const ORG = 'org-1';
const CLAIM = 'claim-1';

describe('appeal recovery flow', () => {
  beforeEach(() => {
    table.length = 0;
    lastOnConflict = undefined;
  });

  it('defines state transitions', () => {
    expect(APPEAL_RECOVERY_TRANSITIONS.denied).toContain('packet_ready');
    expect(canTransitionAppealRecovery('denied', 'packet_ready')).toBe(true);
  });

  it('rejects invalid transitions', async () => {
    await getOrCreateAppealRecoveryCase(ORG, CLAIM);
    await expect(transitionAppealRecoveryCase(ORG, CLAIM, 'review_requested')).rejects.toThrow('Invalid appeal recovery transition');
  });

  it('enforces organization_id + claim_id uniqueness in upsert path', async () => {
    await getOrCreateAppealRecoveryCase(ORG, CLAIM);
    await getOrCreateAppealRecoveryCase(ORG, CLAIM);
    expect(table.length).toBe(1);
    expect(lastOnConflict).toBe('organization_id,claim_id');
  });

  it('packet generation moves state to packet_ready', async () => {
    const row = await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    expect(row.current_state).toBe('packet_ready');
    expect(row.packet_id).toBe('packet-1');
  });

  it('request review moves state to review_requested', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    const row = await requestReviewForRecovery(ORG, CLAIM);
    expect(row.current_state).toBe('review_requested');
  });

  it('core decision stores trace, outcome, and dispatch', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await requestReviewForRecovery(ORG, CLAIM);
    const row = await runCoreDecisionForRecovery(ORG, CLAIM, {
      coreTraceId: 'trace-123',
      outcome: 'approval_required',
      dispatchStatus: 'completed',
    });
    expect(row.current_state).toBe('approval_required');
    expect(row.core_trace_id).toBe('trace-123');
    expect(row.core_decision_outcome).toBe('approval_required');
    expect(row.core_dispatch_status).toBe('completed');
  });

  it('stores glue run id on approval_workflow_launched', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await requestReviewForRecovery(ORG, CLAIM);
    await runCoreDecisionForRecovery(ORG, CLAIM, {
      coreTraceId: 'trace-123',
      outcome: 'approval_required',
      dispatchStatus: 'completed',
    });

    const row = await launchApprovalWorkflowForRecovery(ORG, CLAIM, 'glue-456');
    expect(row.current_state).toBe('approval_workflow_launched');
    expect(row.glue_run_id).toBe('glue-456');
  });

  it('manual submission sets submitted_manual_delivery state', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await requestReviewForRecovery(ORG, CLAIM);
    await runCoreDecisionForRecovery(ORG, CLAIM, {
      coreTraceId: 'trace-123',
      outcome: 'approved_for_submission',
      dispatchStatus: 'completed',
    });

    const row = await markSubmittedManually(ORG, CLAIM);
    expect(row.current_state).toBe('submitted_manual_delivery');
    expect(getRecoveryStepLabel(row.current_state)).toBe('Submitted Manually');
  });

  it('payer response transitions to payer_response_received', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await requestReviewForRecovery(ORG, CLAIM);
    await runCoreDecisionForRecovery(ORG, CLAIM, {
      coreTraceId: 'trace-123',
      outcome: 'approved_for_submission',
      dispatchStatus: 'completed',
    });
    await markSubmittedManually(ORG, CLAIM);

    const row = await recordPayerResponseForRecovery(ORG, CLAIM, 'received');
    expect(row.current_state).toBe('payer_response_received');
    expect(row.payer_response_status).toBe('received');
  });

  it('supports recovered, lost, and written_off final states', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await requestReviewForRecovery(ORG, CLAIM);
    await runCoreDecisionForRecovery(ORG, CLAIM, {
      coreTraceId: 'trace-123',
      outcome: 'approved_for_submission',
      dispatchStatus: 'completed',
    });
    await markSubmittedManually(ORG, CLAIM);
    await recordPayerResponseForRecovery(ORG, CLAIM, 'received');

    const recovered = await recordRecoveryOutcome(ORG, CLAIM, 25000);
    expect(recovered.current_state).toBe('recovered');
    expect(isTerminalAppealRecoveryState(recovered.current_state)).toBe(true);

    const lostRow = await markLostOutcome(ORG, 'claim-2');
    expect(lostRow.current_state).toBe('lost');

    const writtenOff = await writeOffOutcome(ORG, 'claim-3');
    expect(writtenOff.current_state).toBe('written_off');
  });

  it('duplicate appeal action does not create duplicate case', async () => {
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    await generatePacketForRecovery(ORG, CLAIM, 'packet-1');
    expect(table.length).toBe(1);
  });
});
