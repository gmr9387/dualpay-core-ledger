/**
 * Per-claim Decision Transparency — opens every contributing factor
 * behind the recommendation, score, evidence package, and playbook
 * choice for a single claim.
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertOctagon, Gavel, FolderOpen, BookOpen, Zap, Sparkles } from 'lucide-react';
import { useClarityData, formatCents } from '@/hooks/use-clarity-data';
import { PageHeader, Panel, ScrollBody, EmptyState, RecoverabilityBar, SeverityBadge, StateBadge } from '@/components/clarity/primitives';
import { ReadinessBadge, FactorRow, EvidenceChecklist, InsufficientEvidence, BasisList, CalculationBreakdown, SectionLabel } from '@/components/clarity/transparency';
import { explainRecoverability } from '@/engine/recoverability';
import { scoreEvidenceReadiness } from '@/engine/evidence-readiness';
import { scoreAppealReadiness } from '@/engine/appeal-readiness';
import { nextBestAction, URGENCY_CLS, URGENCY_LABEL } from '@/engine/next-action';
import { recommendPlaybook, EFFORT_CLS } from '@/engine/playbooks';
import { checkClaimSufficiency } from '@/engine/sufficiency';

export default function TransparencyDetail() {
  const { claimId } = useParams();
  const { data: claims, isLoading } = useClarityData();
  const claim = useMemo(() => claims?.find(c => c.claim_id === claimId), [claims, claimId]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  if (!claim || !claims) return <EmptyState title="Claim not found" body="No transparency package available for this claim." icon={<AlertOctagon className="h-5 w-5" />} />;

  const sufficiency = checkClaimSufficiency(claim);
  const recov = explainRecoverability(claim);
  const evidence = scoreEvidenceReadiness(claim, claims);
  const appeal = scoreAppealReadiness(claim, claims);
  const action = nextBestAction(claim);
  const playbook = recommendPlaybook(claim);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`${claim.claim_id} · Decision Transparency`}
        subtitle={`${claim.intel.payer_name} → ${claim.provider_name} · Why every recommendation was made.`}
        actions={
          <Link to="/transparency" className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md border bg-card hover:bg-muted text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Transparency
          </Link>
        }
      />

      <div className="px-5 py-3 border-b bg-card flex items-center gap-3 flex-wrap">
        <StateBadge state={claim.intel.reimbursement_state} />
        <SeverityBadge severity={claim.intel.severity} />
        <span className="font-mono text-[11px] text-muted-foreground">Aging {claim.intel.aging_days}d</span>
        <span className="font-mono text-[11px] amount-negative ml-auto">{formatCents(claim.intel.amount_at_risk_cents)} at risk</span>
      </div>

      {!sufficiency.sufficient && (
        <div className="px-5 pt-4">
          <InsufficientEvidence check={sufficiency} body="This claim does not yet have enough source data to render every recommendation. The surfaces below operate on a partial dataset." />
        </div>
      )}

      <ScrollBody>
        <div className="grid grid-cols-2 gap-4 p-5">
          {/* ---------------- Recoverability ---------------- */}
          <Panel
            title="Recoverability Score Breakdown"
            action={
              <span className={`pill border ${
                recov.tier === 'HIGH' ? 'bg-status-paid/10 text-status-paid border-status-paid/30'
                : recov.tier === 'MEDIUM' ? 'bg-status-pending/10 text-status-pending border-status-pending/30'
                : 'bg-status-denied/10 text-status-denied border-status-denied/30'
              }`}>{recov.tier} · {recov.score}</span>
            }
          >
            <div className="flex items-start gap-2.5 mb-3">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-[12.5px] text-foreground">{recov.headline}</div>
            </div>
            <SectionLabel>Positive factors</SectionLabel>
            <div className="mb-3">
              {recov.factors.filter(f => f.delta > 0).map((f, i) => (
                <FactorRow key={i} label={f.label} detail={f.detail} delta={f.delta} weight={f.weight} status="pass" />
              ))}
              {recov.factors.filter(f => f.delta > 0).length === 0 && <div className="text-[11.5px] text-muted-foreground italic">None.</div>}
            </div>
            <SectionLabel>Negative factors</SectionLabel>
            <div className="mb-3">
              {recov.factors.filter(f => f.delta < 0).map((f, i) => (
                <FactorRow key={i} label={f.label} detail={f.detail} delta={f.delta} weight={f.weight} status="fail" />
              ))}
              {recov.factors.filter(f => f.delta < 0).length === 0 && <div className="text-[11.5px] text-muted-foreground italic">None.</div>}
            </div>
            <CalculationBreakdown steps={[
              { label: 'Baseline (denial taxonomy)', value: String(recov.factors.find(f => f.weight === 'baseline')?.delta ?? 0), mono: true },
              { label: 'Sum of adjustments',          value: String(recov.factors.filter(f => f.weight === 'adjust').reduce((s, f) => s + f.delta, 0)), mono: true },
              { label: 'Clamped to 0–100',            value: String(recov.score), mono: true },
            ]} />
            <div className="mt-3 rounded bg-accent/40 border border-primary/15 p-2.5">
              <SectionLabel>Recommended recovery path</SectionLabel>
              <div className="text-[12px] text-foreground">{recov.recommended_path}</div>
            </div>
          </Panel>

          {/* ---------------- Next Best Action ---------------- */}
          <Panel
            title="Next Best Action — Explanation"
            action={<span className={`pill border ${URGENCY_CLS[action.urgency]}`}>{URGENCY_LABEL[action.urgency]}</span>}
          >
            <div className="flex items-start gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <div className="text-[13px] font-semibold text-foreground">{action.headline}</div>
                <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">{action.owner} · {action.effort_minutes}m</div>
              </div>
            </div>
            <SectionLabel>Why recommended</SectionLabel>
            <BasisList items={action.why} />
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11.5px]">
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected outcome</div>
                <div className="font-mono text-foreground">{Math.round(action.expected_probability * 100)}% × {formatCents(claim.intel.amount_at_risk_cents)}</div>
                <div className="font-mono amount-positive">= {formatCents(action.expected_value_cents)}</div>
              </div>
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence basis</div>
                <div className="text-foreground">Playbook base × claim-level adjustments.</div>
              </div>
            </div>
            {action.evidence_refs.length > 0 && (
              <div className="mt-3">
                <SectionLabel>Required evidence</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {action.evidence_refs.map(e => (
                    <span key={e} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-card border text-foreground">{e}</span>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* ---------------- Evidence Readiness ---------------- */}
          <Panel
            title="Evidence Readiness"
            action={<ReadinessBadge tier={evidence.tier} />}
          >
            {evidence.tier === 'INSUFFICIENT' ? (
              <InsufficientEvidence body="Not enough requirement signals to score this packet — no active denial requirements and no payer profile available." />
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <RecoverabilityBar score={evidence.score} />
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{evidence.items_present}/{evidence.items_required} on file</div>
                </div>
                <SectionLabel>Items required</SectionLabel>
                <EvidenceChecklist items={[...evidence.items_missing, ...evidence.items_satisfied]} />
                {evidence.recommended_actions.length > 0 && (
                  <div className="mt-3 rounded bg-accent/40 border border-primary/15 p-2.5">
                    <SectionLabel>Recommended actions</SectionLabel>
                    <BasisList items={evidence.recommended_actions} />
                  </div>
                )}
                <div className="mt-3">
                  <SectionLabel>How the requirements list was assembled</SectionLabel>
                  <BasisList items={evidence.basis} />
                </div>
              </>
            )}
          </Panel>

          {/* ---------------- Appeal Readiness ---------------- */}
          <Panel
            title="Appeal Readiness"
            action={<ReadinessBadge tier={appeal.tier} />}
          >
            {appeal.tier === 'INSUFFICIENT' ? (
              <InsufficientEvidence body="No active denial or payer profile available to assess appeal readiness." />
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1"><RecoverabilityBar score={appeal.score} /></div>
                  <div className="font-mono text-[11px] text-muted-foreground">Deadline: {appeal.deadline_status.replace(/_/g, ' ')}</div>
                </div>
                <SectionLabel>Contributing factors</SectionLabel>
                {appeal.factors.map((f, i) => (
                  <FactorRow
                    key={i}
                    label={f.label}
                    detail={f.detail}
                    delta={f.earned}
                    weight={`weight ${f.weight}`}
                    status={f.status}
                  />
                ))}
                <CalculationBreakdown steps={[
                  ...appeal.factors.map(f => ({ label: `${f.label} (${f.earned}/${f.weight})`, value: `${f.earned}`, mono: true })),
                  { label: 'Total earned', value: `${appeal.score} / 100`, mono: true },
                ]} />
                {appeal.blockers.length > 0 && (
                  <div className="mt-3">
                    <SectionLabel>Blockers</SectionLabel>
                    <ul className="space-y-0.5 text-[11.5px]">
                      {appeal.blockers.map(b => (
                        <li key={b} className="flex items-start gap-1.5 text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-denied mt-1.5 shrink-0" /><span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {appeal.next_steps.length > 0 && (
                  <div className="mt-3">
                    <SectionLabel>Next steps</SectionLabel>
                    <BasisList items={appeal.next_steps} />
                  </div>
                )}
              </>
            )}
          </Panel>

          {/* ---------------- Playbook ---------------- */}
          {playbook && (
            <Panel
              title="Recovery Playbook — Why Selected"
              action={<span className={`pill border ${EFFORT_CLS[playbook.effort]}`}>{playbook.effort} effort</span>}
            >
              <div className="flex items-start gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{playbook.playbook.title}</div>
                  <div className="text-[11.5px] text-muted-foreground">{playbook.playbook.summary}</div>
                </div>
              </div>
              <SectionLabel>Selected because</SectionLabel>
              <BasisList items={[
                `Active denial category matches: ${playbook.playbook.category.replace(/_/g, ' ')}.`,
                `Playbook base recovery probability: ${Math.round(playbook.playbook.base_recovery_probability * 100)}%.`,
                `After claim-level adjustments: ${Math.round(playbook.expected_recovery_probability * 100)}%.`,
              ]} />
              {playbook.adjustment_factors.length > 0 && (
                <div className="mt-3">
                  <SectionLabel>Adjustment factors</SectionLabel>
                  {playbook.adjustment_factors.map((a, i) => (
                    <FactorRow
                      key={i}
                      label={a.label}
                      detail={a.detail}
                      delta={Math.round(a.delta * 100)}
                      weight="probability"
                      status={a.delta >= 0 ? 'pass' : 'warn'}
                    />
                  ))}
                </div>
              )}
              <div className="mt-3">
                <SectionLabel>Required evidence per playbook</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {playbook.playbook.required_evidence.map(e => (
                    <span key={e} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-card border text-foreground">{e}</span>
                  ))}
                </div>
              </div>
              {playbook.identified_gaps.length > 0 && (
                <div className="mt-3 rounded border border-status-pending/30 bg-status-pending/5 p-2.5">
                  <SectionLabel>Identified gaps for this claim</SectionLabel>
                  <ul className="space-y-0.5 text-[11.5px]">
                    {playbook.identified_gaps.map(g => (
                      <li key={g} className="flex items-start gap-1.5 text-status-pending">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-pending mt-1.5 shrink-0" /><span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}

          {/* ---------------- Cross-links ---------------- */}
          <Panel title="Open in workflow">
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Link to={`/denials/${claim.claim_id}`} className="rounded border bg-card hover:bg-muted px-3 py-2 flex items-center gap-2">
                <AlertOctagon className="h-3.5 w-3.5 text-primary" /> Denial Detail
              </Link>
              <Link to={`/packet/${claim.claim_id}`} className="rounded border bg-card hover:bg-muted px-3 py-2 flex items-center gap-2">
                <Gavel className="h-3.5 w-3.5 text-primary" /> Appeal Packet
              </Link>
              <Link to="/evidence" className="rounded border bg-card hover:bg-muted px-3 py-2 flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-primary" /> Evidence Vault
              </Link>
              <Link to="/playbooks" className="rounded border bg-card hover:bg-muted px-3 py-2 flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-primary" /> Playbooks
              </Link>
            </div>
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
