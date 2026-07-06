import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, AlertOctagon } from 'lucide-react';
import { useClarityData, formatCents } from '@/hooks/use-clarity-data';
import { useOrg } from '@/hooks/use-org';
import { PageHeader, EmptyState, Panel, ScrollBody } from '@/components/clarity/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { can } from '@/lib/role-permissions';
import { toast } from '@/hooks/use-toast';
import {
  APPEAL_RECOVERY_STATES,
  getAllowedAppealRecoveryTransitions,
  getAppealRecoveryCase,
  getOrCreateAppealRecoveryCase,
  getRecoveryStepLabel,
  type AppealRecoveryCase,
} from '@/data/appeal-recovery';
import {
  generateAppealPacketAction,
  launchGlueWorkflowAction,
  markApprovedAction,
  markLostAction,
  markSubmittedManuallyAction,
  recordPayerResponseAction,
  recordRecoveryAction,
  requestAppealReviewAction,
  runCoreDecisionAction,
  writeOffAction,
} from '@/data/operational-workflows';

export default function RecoverDeniedClaim() {
  const { claimId } = useParams();
  const { data: claims, isLoading } = useClarityData();
  const { currentOrg } = useOrg();

  const claim = useMemo(() => claims?.find((c) => c.claim_id === claimId), [claims, claimId]);
  const deniedClaims = useMemo(
    () => (claims ?? []).filter((c) => c.intel.denial_events.length > 0),
    [claims],
  );

  const [recoveryCase, setRecoveryCase] = useState<AppealRecoveryCase | null>(null);
  const [loadingCase, setLoadingCase] = useState(false);
  const [busy, setBusy] = useState(false);

  const [coreOutcome, setCoreOutcome] = useState<'approval_required' | 'approved_for_submission' | 'lost' | 'written_off'>('approval_required');
  const [coreDispatchStatus, setCoreDispatchStatus] = useState('completed');
  const [coreTraceId, setCoreTraceId] = useState('');
  const [glueRunId, setGlueRunId] = useState('');
  const [payerResponseStatus, setPayerResponseStatus] = useState('received');
  const [recoveredAmount, setRecoveredAmount] = useState('0');

  const canWrite = can.edit(currentOrg?.role);

  const refreshCase = async () => {
    if (!currentOrg?.org_id || !claimId) return;
    setLoadingCase(true);
    try {
      const existing = await getAppealRecoveryCase(currentOrg.org_id, claimId);
      setRecoveryCase(existing ?? await getOrCreateAppealRecoveryCase(currentOrg.org_id, claimId));
    } catch (err) {
      toast({ title: 'Failed to load recovery case', description: String(err), variant: 'destructive' });
    } finally {
      setLoadingCase(false);
    }
  };

  useEffect(() => {
    void refreshCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.org_id, claimId]);

  const runAction = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: success });
      await refreshCase();
    } catch (err) {
      toast({ title: 'Action failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  }

  if (!claimId) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Recover Denied Claim" subtitle="Pick a denied claim to run the canonical denial recovery workflow." />
        <ScrollBody>
          <div className="p-5">
            {deniedClaims.length === 0 ? (
              <EmptyState title="No denied claims found" body="Import denied claims to begin recovery." icon={<AlertOctagon className="h-5 w-5" />} />
            ) : (
              <Panel title="Denied Claims">
                <div className="divide-y -mx-4 -my-4">
                  {deniedClaims.map((c) => (
                    <Link key={c.claim_id} to={`/recover/${c.claim_id}`} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40">
                      <span className="font-mono text-[12px] font-semibold">{c.claim_id}</span>
                      <span className="text-[12px] text-muted-foreground">{c.intel.payer_name}</span>
                      <span className="ml-auto font-mono text-[12px] amount-negative">{formatCents(c.intel.amount_at_risk_cents)}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </ScrollBody>
      </div>
    );
  }

  if (!claim) {
    return <EmptyState title="Claim not found" body="The claim ID does not exist in the operational dataset." icon={<AlertOctagon className="h-5 w-5" />} />;
  }

  if (!currentOrg) {
    return <EmptyState title="No organization selected" body="Select an organization to continue." icon={<AlertOctagon className="h-5 w-5" />} />;
  }

  const state = recoveryCase?.current_state ?? 'denied';
  const nextStates = getAllowedAppealRecoveryTransitions(state);
  const currentStep = getRecoveryStepLabel(state);
  const nextAction = nextStates.length > 0 ? getRecoveryStepLabel(nextStates[0]) : 'Final state reached';

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Recover Denied Claim · ${claim.claim_id}`}
        subtitle={`${claim.intel.payer_name} · ${claim.provider_name} · ${formatCents(claim.intel.amount_at_risk_cents)} at risk`}
        actions={<Link to="/recover" className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md border bg-card hover:bg-muted text-foreground">All denied claims</Link>}
      />

      <div className="px-5 py-2 border-b bg-muted/40 text-[11.5px] text-muted-foreground">
        {state === 'submitted_manual_delivery'
          ? 'Marked as submitted manually. This does not transmit to payer.'
          : 'Use this guided flow to run one canonical denied-claim recovery workflow.'}
      </div>

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Workflow Status">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <Status label="Current step" value={currentStep} />
                <Status label="Next action" value={nextAction} />
                <Status label="Packet status" value={recoveryCase?.packet_id ? `Ready (${recoveryCase.packet_id})` : state === 'denied' ? 'Not generated' : 'Pending'} />
                <Status label="Review status" value={['review_requested', 'core_decision_received', 'approval_required', 'approval_workflow_launched', 'approved_for_submission', 'submitted_manual_delivery', 'payer_response_received', 'recovered', 'lost', 'written_off'].includes(state) ? 'Requested' : 'Not requested'} />
                <Status label="Core decision" value={recoveryCase?.core_decision_outcome ? `${recoveryCase.core_decision_outcome} (${recoveryCase.core_dispatch_status ?? 'n/a'})` : 'Not run'} />
                <Status label="Glue workflow status" value={recoveryCase?.glue_run_id ? `Launched (${recoveryCase.glue_run_id})` : 'Not launched'} />
                <Status label="Final outcome" value={['recovered', 'lost', 'written_off'].includes(state) ? getRecoveryStepLabel(state) : 'Open'} />
                <Status label="Payer response" value={recoveryCase?.payer_response_status ?? 'Not recorded'} />
              </div>
            </Panel>

            <Panel title="Claim Context">
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <Status label="Claim ID" value={claim.claim_id} mono />
                <Status label="Organization" value={currentOrg.name} />
                <Status label="Assigned User" value={recoveryCase?.assigned_to_user_id ?? 'Unassigned'} mono />
                <Status label="Payer" value={claim.intel.payer_name} />
                <Status label="Provider" value={claim.provider_name} />
                <Status label="At Risk" value={formatCents(claim.intel.amount_at_risk_cents)} mono />
              </div>
            </Panel>

            <Panel title="State Machine">
              <div className="flex flex-wrap gap-1.5">
                {APPEAL_RECOVERY_STATES.map((s) => (
                  <span key={s} className={`pill border ${s === state ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground'}`}>
                    {getRecoveryStepLabel(s)}
                  </span>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Recover Denied Claim Actions">
              {!canWrite ? (
                <div className="text-[12px] text-muted-foreground">Viewer role: write actions are disabled.</div>
              ) : (
                <div className="space-y-2">
                  <ActionButton label="Generate Packet" disabled={busy} onClick={() => runAction(() => generateAppealPacketAction(claim.claim_id, currentOrg.org_id), 'Packet generated')} />
                  <ActionButton label="Request Review" disabled={busy} onClick={() => runAction(() => requestAppealReviewAction(claim.claim_id, currentOrg.org_id), 'Review requested')} />

                  <div className="border rounded-md p-2 space-y-2">
                    <Label className="text-[10.5px]">Run Core Decision</Label>
                    <Input value={coreTraceId} onChange={(e) => setCoreTraceId(e.target.value)} placeholder="Core trace ID" className="h-8 text-[12px]" />
                    <Select value={coreOutcome} onValueChange={(v) => setCoreOutcome(v as typeof coreOutcome)}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approval_required">approval_required</SelectItem>
                        <SelectItem value="approved_for_submission">approved_for_submission</SelectItem>
                        <SelectItem value="lost">lost</SelectItem>
                        <SelectItem value="written_off">written_off</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={coreDispatchStatus} onChange={(e) => setCoreDispatchStatus(e.target.value)} placeholder="Dispatch status" className="h-8 text-[12px]" />
                    <ActionButton
                      label="Run Core Decision"
                      disabled={busy}
                      onClick={() => runAction(() => runCoreDecisionAction(claim.claim_id, currentOrg.org_id, {
                        coreTraceId: coreTraceId.trim() || `trace_${Date.now().toString(36)}`,
                        outcome: coreOutcome,
                        dispatchStatus: coreDispatchStatus.trim() || 'completed',
                      }), 'Core decision recorded')}
                    />
                  </div>

                  <div className="border rounded-md p-2 space-y-2">
                    <Label className="text-[10.5px]">Launch Glue Workflow</Label>
                    <Input value={glueRunId} onChange={(e) => setGlueRunId(e.target.value)} placeholder="Glue run ID" className="h-8 text-[12px]" />
                    <ActionButton label="Launch Glue Workflow" disabled={busy} onClick={() => runAction(() => launchGlueWorkflowAction(claim.claim_id, currentOrg.org_id, glueRunId.trim() || `glue_${Date.now().toString(36)}`), 'Glue workflow launched')} />
                  </div>

                  <ActionButton label="Mark Approved" disabled={busy} onClick={() => runAction(() => markApprovedAction(claim.claim_id, currentOrg.org_id), 'Marked approved for submission')} />
                  <ActionButton label="Mark Submitted Manually" disabled={busy} onClick={() => runAction(() => markSubmittedManuallyAction(claim.claim_id, currentOrg.org_id), 'Marked as submitted manually. This does not transmit to payer.')} />

                  <div className="border rounded-md p-2 space-y-2">
                    <Label className="text-[10.5px]">Record Payer Response</Label>
                    <Input value={payerResponseStatus} onChange={(e) => setPayerResponseStatus(e.target.value)} placeholder="Response status" className="h-8 text-[12px]" />
                    <ActionButton label="Record Payer Response" disabled={busy} onClick={() => runAction(() => recordPayerResponseAction(claim.claim_id, currentOrg.org_id, payerResponseStatus.trim() || 'received'), 'Payer response recorded')} />
                  </div>

                  <div className="border rounded-md p-2 space-y-2">
                    <Label className="text-[10.5px]">Record Recovery (USD)</Label>
                    <Input type="number" min="0" step="0.01" value={recoveredAmount} onChange={(e) => setRecoveredAmount(e.target.value)} className="h-8 text-[12px]" />
                    <ActionButton label="Record Recovery" disabled={busy} onClick={() => runAction(() => markRecovered(claim.claim_id, currentOrg.org_id, recoveredAmount), 'Recovery recorded')} />
                  </div>

                  <ActionButton label="Mark Lost" disabled={busy} tone="danger" onClick={() => runAction(() => markLostAction(claim.claim_id, currentOrg.org_id), 'Marked lost')} />
                  <ActionButton label="Write Off" disabled={busy} tone="danger" onClick={() => runAction(() => writeOffAction(claim.claim_id, currentOrg.org_id), 'Written off')} />
                </div>
              )}
            </Panel>

            <Panel title="Allowed Next States">
              {loadingCase ? (
                <div className="text-[12px] text-muted-foreground">Loading…</div>
              ) : nextStates.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No further transitions allowed.</div>
              ) : (
                <ul className="space-y-1 text-[12px]">
                  {nextStates.map((s) => <li key={s}>• {getRecoveryStepLabel(s)}</li>)}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

async function markRecovered(claimId: string, orgId: string, recoveredAmount: string): Promise<void> {
  const cents = Math.max(0, Math.round(Number(recoveredAmount || 0) * 100));
  await recordPayerResponseAction(claimId, orgId, 'recovered');
  await recordRecoveryAction(claimId, orgId, cents);
}

function Status({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12px] text-foreground ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={tone === 'danger' ? 'outline' : 'default'}
      className={tone === 'danger' ? 'w-full border-status-denied/40 text-status-denied hover:bg-status-denied/10' : 'w-full'}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
