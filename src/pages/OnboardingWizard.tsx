/**
 * Onboarding Wizard — Claim Clarity Phase 3C
 *
 * Five-step first-run wizard that guides a new clinic admin from
 * account creation to the Executive ROI Dashboard in under 5 minutes.
 *
 * Step 1 — Organization & role setup
 * Step 2 — Upload first CSV / remittance file
 * Step 3 — Validate import & review detected records
 * Step 4 — Create initial work queue  ← fully implemented (Phase 3C Step 4)
 * Step 5 — Redirect to Executive Dashboard
 *
 * Requirements honoured:
 *  • Existing import logic untouched (steps 2-3 link to ImportCenter)
 *  • Executive Dashboard not redesigned
 *  • No AI features
 *  • Progress indicator on every step
 *  • Empty and error states on every step
 *  • Demo data can be skipped
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/hooks/use-org';
import { useClarityData, selectByQueue, formatCentsCompact } from '@/hooks/use-clarity-data';
import {
  QUEUE_ORDER,
  createDefaultQueueConfig,
  saveQueueConfig,
  markOnboardingComplete,
  type QueueConfigMap,
  type QueueEntry,
} from '@/lib/queue-config';
import { QUEUE_LABEL, OWNER_LABEL } from '@/engine/denial-intelligence';
import type { WorkQueueId, WorkflowOwner } from '@/types/clarity';
import {
  Building2,
  Upload,
  ClipboardCheck,
  ListChecks,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Constants ────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Organization', icon: Building2 },
  { id: 2, label: 'Upload Data', icon: Upload },
  { id: 3, label: 'Validate',    icon: ClipboardCheck },
  { id: 4, label: 'Work Queues', icon: ListChecks },
  { id: 5, label: 'Dashboard',   icon: LayoutDashboard },
] as const;

type StepId = typeof STEPS[number]['id'];

const WORKFLOW_OWNERS: WorkflowOwner[] = [
  'biller', 'coder', 'auth_team', 'clinical', 'appeals', 'cob_team', 'eligibility', 'unassigned',
];

// ── Wizard shell ─────────────────────────────────────────────

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentOrg, orgs, loading: orgLoading, createOrg, selectOrg } = useOrg();
  const [step, setStep] = useState<StepId>(1);

  // Step 1 state
  const [orgName, setOrgName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [role, setRole] = useState('clinic_admin');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Step 4 state — queue configuration
  const [queueConfig, setQueueConfig] = useState<QueueConfigMap>(createDefaultQueueConfig);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: claims, isLoading: claimsLoading } = useClarityData();

  function advance() { setStep(s => (s < 5 ? (s + 1) as StepId : s)); }
  function retreat() { setStep(s => (s > 1 ? (s - 1) as StepId : s)); }

  // ── Step 1: create or select org ─────────────────────────

  async function handleOrgSetup() {
    setOrgError(null);
    if (!orgName.trim()) { setOrgError('Organization name is required.'); return; }
    if (!clinicName.trim()) { setOrgError('Clinic name is required.'); return; }

    // If user already has an org, select it and move on.
    if (orgs.length > 0 && !currentOrg) {
      selectOrg(orgs[0].org_id);
      advance(); return;
    }
    if (currentOrg) { advance(); return; }

    setCreatingOrg(true);
    const created = await createOrg(`${orgName} — ${clinicName}`);
    setCreatingOrg(false);
    if (!created) { setOrgError('Failed to create organization. Please try again.'); return; }
    advance();
  }

  // Pre-fill fields from existing org
  useEffect(() => {
    if (currentOrg && !orgName) {
      setOrgName(currentOrg.name.split(' — ')[0] ?? currentOrg.name);
      setClinicName(currentOrg.name.split(' — ')[1] ?? '');
    }
  }, [currentOrg]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 4: queue creation ────────────────────────────────

  async function handleCreateQueues() {
    setSaveError(null);
    if (!currentOrg) { setSaveError('No organization selected.'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600)); // brief affordance
    const ok = saveQueueConfig(currentOrg.org_id, queueConfig);
    setSaving(false);
    if (!ok) { setSaveError('Failed to save queue configuration. Please try again.'); return; }
    toast.success('Work queues created successfully.');
    advance();
  }

  function handleSkipQueues() {
    if (currentOrg) {
      saveQueueConfig(currentOrg.org_id, createDefaultQueueConfig());
    }
    advance();
  }

  // ── Step 5: redirect to dashboard ────────────────────────

  useEffect(() => {
    if (step === 5) {
      if (currentOrg) markOnboardingComplete(currentOrg.org_id);
      const t = setTimeout(() => navigate('/executive'), 2000);
      return () => clearTimeout(t);
    }
  }, [step, currentOrg, navigate]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-3 flex items-center gap-3">
        <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <ListChecks className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground">DualPay Setup</span>
        <span className="text-[11px] text-muted-foreground font-mono ml-auto">
          Step {step} of {STEPS.length}
        </span>
      </div>

      {/* Progress indicator */}
      <ProgressBar currentStep={step} />

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          {step === 1 && (
            <Step1OrgSetup
              orgName={orgName} setOrgName={setOrgName}
              clinicName={clinicName} setClinicName={setClinicName}
              role={role} setRole={setRole}
              orgError={orgError}
              busy={creatingOrg || orgLoading}
              existingOrg={currentOrg?.name ?? null}
              onNext={handleOrgSetup}
            />
          )}
          {step === 2 && (
            <Step2Upload onNext={advance} onBack={retreat} />
          )}
          {step === 3 && (
            <Step3Validate
              claimsLoading={claimsLoading}
              claimCount={claims?.length ?? 0}
              onNext={advance}
              onBack={retreat}
            />
          )}
          {step === 4 && (
            <Step4WorkQueues
              claims={claims ?? []}
              claimsLoading={claimsLoading}
              queueConfig={queueConfig}
              setQueueConfig={setQueueConfig}
              saving={saving}
              saveError={saveError}
              onCreate={handleCreateQueues}
              onSkip={handleSkipQueues}
              onBack={retreat}
            />
          )}
          {step === 5 && <Step5Done />}
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ─────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: StepId }) {
  return (
    <div className="border-b bg-card px-6 py-0">
      <div className="flex">
        {STEPS.map((s, i) => {
          const done = s.id < currentStep;
          const active = s.id === currentStep;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-stretch flex-1 relative">
              {/* connector line */}
              {i > 0 && (
                <div className={`absolute top-0 left-0 h-0.5 w-full ${done ? 'bg-primary' : 'bg-border'}`} style={{ top: '22px' }} />
              )}
              <div className={`relative z-10 flex flex-col items-center gap-1 py-3 flex-1
                ${active ? 'text-primary' : done ? 'text-primary/60' : 'text-muted-foreground'}`}>
                <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2
                  ${done ? 'bg-primary/10 border-primary/40' : active ? 'bg-primary/15 border-primary' : 'bg-muted border-border'}`}>
                  {done
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 1: Organization & role ───────────────────────────────

function Step1OrgSetup({
  orgName, setOrgName,
  clinicName, setClinicName,
  role, setRole,
  orgError, busy, existingOrg, onNext,
}: {
  orgName: string; setOrgName: (v: string) => void;
  clinicName: string; setClinicName: (v: string) => void;
  role: string; setRole: (v: string) => void;
  orgError: string | null; busy: boolean;
  existingOrg: string | null;
  onNext: () => void;
}) {
  return (
    <Card
      title="Tell us about your organization"
      subtitle="We'll use this to configure your workspace."
      step={1}
    >
      {existingOrg && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-status-paid/30 bg-status-paid/5 px-3 py-2 text-[12.5px] text-status-paid">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Organization already set up: <strong>{existingOrg}</strong>
        </div>
      )}
      <div className="space-y-4">
        <Field label="Organization Name" hint="Legal or billing entity name (e.g. health system, practice group)">
          <input
            className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Great Lakes Health System"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            disabled={!!existingOrg}
          />
        </Field>
        <Field label="Clinic / Location Name" hint="Specific clinic or site within the organization — combined with Organization Name to form your workspace identifier">
          <input
            className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Northside Family Medicine"
            value={clinicName}
            onChange={e => setClinicName(e.target.value)}
            disabled={!!existingOrg}
          />
        </Field>
        <Field label="Your Role">
          <select
            className="w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            <option value="clinic_admin">Clinic Admin</option>
            <option value="billing_manager">Billing Manager</option>
            <option value="revenue_cycle">Revenue Cycle Director</option>
            <option value="cfo">CFO / Finance Lead</option>
            <option value="provider">Provider / Physician</option>
          </select>
        </Field>
      </div>
      {orgError && <ErrorBanner message={orgError} />}
      <div className="flex justify-end mt-6">
        <PrimaryButton onClick={onNext} busy={busy} label="Continue" iconRight={<ChevronRight className="h-4 w-4" />} />
      </div>
    </Card>
  );
}

// ── Step 2: Upload ─────────────────────────────────────────────

function Step2Upload({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <Card
      title="Upload your first file"
      subtitle="Import a denial export, aging report, or 835 remittance to populate your queues."
      step={2}
    >
      <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center">
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Import data using the full Import Center</p>
        <p className="text-[12px] text-muted-foreground mt-1">
          Your existing import logic, field mapping, and validation rules are available there.
        </p>
        <a
          href="/factory/import"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Open Import Center <ChevronRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="mt-3 text-[11.5px] text-muted-foreground text-center">
        Already imported data? Continue to review what was detected.
      </p>
      <NavRow onBack={onBack} onNext={onNext} nextLabel="I've imported my data" />
    </Card>
  );
}

// ── Step 3: Validate ───────────────────────────────────────────

function Step3Validate({
  claimsLoading, claimCount, onNext, onBack,
}: {
  claimsLoading: boolean; claimCount: number;
  onNext: () => void; onBack: () => void;
}) {
  return (
    <Card
      title="Validate your import"
      subtitle="Review what was detected in your uploaded data."
      step={3}
    >
      {claimsLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading records…</span>
        </div>
      ) : claimCount === 0 ? (
        <div className="rounded-lg border border-status-pending/30 bg-status-pending/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-status-pending mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">No records detected</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Go back and upload a file, or continue to configure your queues with sample data.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-status-paid/30 bg-status-paid/5 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-status-paid shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {claimCount.toLocaleString()} claim{claimCount !== 1 ? 's' : ''} detected
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Records are ready to be assigned to work queues.
              </p>
            </div>
          </div>
        </div>
      )}
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Set up work queues" />
    </Card>
  );
}

// ── Step 4: Work Queues ────────────────────────────────────────
// This is the fully-implemented Phase 3C Step 4.

function Step4WorkQueues({
  claims, claimsLoading,
  queueConfig, setQueueConfig,
  saving, saveError,
  onCreate, onSkip, onBack,
}: {
  claims: ReturnType<typeof useClarityData>['data'] & {}[];
  claimsLoading: boolean;
  queueConfig: QueueConfigMap;
  setQueueConfig: React.Dispatch<React.SetStateAction<QueueConfigMap>>;
  saving: boolean;
  saveError: string | null;
  onCreate: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const hasData = claims.length > 0;

  const queueStats = useMemo(() => {
    return QUEUE_ORDER.map(q => {
      const items = hasData ? selectByQueue(claims as Parameters<typeof selectByQueue>[0], q) : [];
      const atRisk = items.reduce((s, c) => s + c.intel.amount_at_risk_cents, 0);
      return { queueId: q, count: items.length, atRisk };
    });
  }, [claims, hasData]);

  const enabledCount = Object.values(queueConfig).filter(e => e.enabled).length;

  function toggleQueue(q: WorkQueueId) {
    setQueueConfig(prev => ({
      ...prev,
      [q]: { ...prev[q], enabled: !prev[q].enabled },
    }));
  }

  function setOwner(q: WorkQueueId, owner: WorkflowOwner) {
    setQueueConfig(prev => ({
      ...prev,
      [q]: { ...prev[q], owner },
    }));
  }

  return (
    <Card
      title="Create your initial work queues"
      subtitle="Select which queues to activate and assign a default workflow owner to each."
      step={4}
    >
      {/* Empty state — no imported data */}
      {!claimsLoading && !hasData && (
        <div className="mb-5 rounded-lg border border-status-pending/30 bg-status-pending/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-status-pending mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">No imported data yet</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Queue counts will be zero until you import claim data. You can still configure
                your queues now and populate them later.
              </p>
            </div>
          </div>
        </div>
      )}

      {claimsLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading claim data…</span>
        </div>
      ) : (
        <>
          {/* Queue selection header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              {enabledCount} of {QUEUE_ORDER.length} queues enabled
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setQueueConfig(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, enabled: true }])) as QueueConfigMap)}
                className="text-[11px] text-primary hover:underline"
              >
                Enable all
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={() => setQueueConfig(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, enabled: false }])) as QueueConfigMap)}
                className="text-[11px] text-muted-foreground hover:underline"
              >
                Disable all
              </button>
            </div>
          </div>

          {/* Queue cards */}
          <div className="space-y-2">
            {queueStats.map(({ queueId, count, atRisk }) => {
              const entry = queueConfig[queueId];
              const enabled = entry.enabled;
              return (
                <QueueCard
                  key={queueId}
                  queueId={queueId}
                  label={QUEUE_LABEL[queueId]}
                  count={count}
                  atRisk={atRisk}
                  hasData={hasData}
                  enabled={enabled}
                  owner={entry.owner}
                  priority={entry.priority}
                  onToggle={() => toggleQueue(queueId)}
                  onOwnerChange={o => setOwner(queueId, o)}
                />
              );
            })}
          </div>

          {/* Error state */}
          {saveError && <ErrorBanner message={saveError} />}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onSkip}
                className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
                disabled={saving}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Use defaults &amp; skip
              </button>
              <PrimaryButton
                onClick={onCreate}
                busy={saving}
                label={`Create ${enabledCount} Queue${enabledCount !== 1 ? 's' : ''}`}
                iconRight={<ListChecks className="h-4 w-4" />}
                disabled={enabledCount === 0}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Queue card component ──────────────────────────────────────

function QueueCard({
  queueId, label, count, atRisk, hasData,
  enabled, owner, priority,
  onToggle, onOwnerChange,
}: {
  queueId: WorkQueueId;
  label: string;
  count: number;
  atRisk: number;
  hasData: boolean;
  enabled: boolean;
  owner: WorkflowOwner;
  priority: QueueEntry['priority'];
  onToggle: () => void;
  onOwnerChange: (o: WorkflowOwner) => void;
}) {
  const priorityCls =
    priority === 'high'   ? 'bg-status-denied/10 text-status-denied border-status-denied/20'
    : priority === 'medium' ? 'bg-status-pending/10 text-status-pending border-status-pending/20'
    : 'bg-muted text-muted-foreground border-border';

  return (
    <div className={`rounded-lg border bg-card transition-colors ${enabled ? 'border-border' : 'border-border/40 opacity-60'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          onClick={onToggle}
          className={`shrink-0 transition-colors ${enabled ? 'text-primary' : 'text-muted-foreground'}`}
          aria-label={enabled ? 'Disable queue' : 'Enable queue'}
        >
          {enabled
            ? <ToggleRight className="h-5 w-5" />
            : <ToggleLeft className="h-5 w-5" />}
        </button>

        {/* Queue info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground truncate">{label}</span>
            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${priorityCls}`}>
              {priority}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {hasData ? (
              <>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {count} item{count !== 1 ? 's' : ''}
                </span>
                {atRisk > 0 && (
                  <span className="text-[11px] font-mono amount-negative">
                    {formatCentsCompact(atRisk)} at risk
                  </span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">No data yet</span>
            )}
          </div>
        </div>

        {/* Owner selector */}
        <div className="shrink-0 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={owner}
            onChange={e => onOwnerChange(e.target.value as WorkflowOwner)}
            disabled={!enabled}
            className="h-7 rounded border bg-background px-2 text-[11px] text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Assign owner for ${label}`}
          >
            {WORKFLOW_OWNERS.map(o => (
              <option key={o} value={o}>{OWNER_LABEL[o]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Done / Redirect ────────────────────────────────────

function Step5Done() {
  return (
    <Card title="You're all set!" subtitle="Redirecting you to the Executive Dashboard…" step={5}>
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="h-16 w-16 rounded-full bg-status-paid/10 border-2 border-status-paid/30 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-status-paid" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Work queues created</p>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Your organization is configured. Taking you to the Executive ROI Dashboard now.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Redirecting…
        </div>
      </div>
    </Card>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────

function Card({
  title, subtitle, step, children,
}: {
  title: string; subtitle?: string; step: StepId; children: React.ReactNode;
}) {
  const StepIcon = STEPS[step - 1].icon;
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-6 py-5 border-b flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <StepIcon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12.5px] font-medium text-foreground">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-status-denied/30 bg-status-denied/5 px-3 py-2">
      <AlertCircle className="h-3.5 w-3.5 text-status-denied mt-0.5 shrink-0" />
      <span className="text-[12px] text-status-denied">{message}</span>
    </div>
  );
}

function PrimaryButton({
  onClick, busy, label, iconRight, disabled,
}: {
  onClick: () => void; busy?: boolean; label: string;
  iconRight?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {label}
      {!busy && iconRight}
    </button>
  );
}

function NavRow({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>
      <PrimaryButton onClick={onNext} label={nextLabel ?? 'Continue'} iconRight={<ChevronRight className="h-4 w-4" />} />
    </div>
  );
}
