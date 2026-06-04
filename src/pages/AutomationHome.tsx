/**
 * Phase 16 — Automation Center home.
 * Pipeline trigger, KPI strip from automation_jobs, and quick links.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Play, ListChecks, History, Settings2, Loader2 } from 'lucide-react';
import { PageHeader, KpiStrip, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useAutomationJobs } from '@/hooks/use-automation';
import { runRecoveryPipeline } from '@/engine/pipeline-orchestrator';
import { runJob, JOB_TYPES } from '@/engine/job-runner';
import { formatCentsCompact } from '@/hooks/use-clarity-data';
import { useOrg } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';

export default function AutomationHome() {
  const { jobs, loading, refresh } = useAutomationJobs(500);
  const { currentOrg } = useOrg();
  const [running, setRunning] = useState(false);
  const canRun = currentOrg ? roleAtLeast(currentOrg.role, 'analyst') : false;

  const kpis = useMemo(() => {
    const completed = jobs.filter(j => j.status === 'completed');
    const failed = jobs.filter(j => j.status === 'failed');
    const pipelines = jobs.filter(j => j.job_type === 'pipeline');
    const cases = jobs.filter(j => j.job_type === 'recovery_case_generation').reduce((s, j) => s + j.records_succeeded, 0);
    const disputes = jobs.filter(j => j.job_type === 'dispute_generation').reduce((s, j) => s + j.records_succeeded, 0);
    const totalValue = jobs.reduce((s, j) => s + (j.recovery_value_cents || 0), 0);
    const successRate = jobs.length ? completed.length / jobs.length : 0;
    return { completed: completed.length, failed: failed.length, pipelines: pipelines.length, cases, disputes, totalValue, successRate };
  }, [jobs]);

  const recent = jobs.slice(0, 10);

  const handlePipeline = async () => {
    setRunning(true);
    try { await runRecoveryPipeline(); refresh(); } finally { setRunning(false); }
  };

  const handleSingle = async (job_type: typeof JOB_TYPES[number]) => {
    setRunning(true);
    try { await runJob(job_type); refresh(); } finally { setRunning(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Automation Center"
        subtitle="Autonomous recovery pipeline · deterministic jobs, rule-driven actions, audited end-to-end."
        actions={
          <button
            onClick={handlePipeline}
            disabled={!canRun || running}
            className="inline-flex items-center gap-1.5 rounded bg-primary text-primary-foreground text-[12px] px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-40"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Recovery Pipeline
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Jobs Run',            value: String(jobs.length) },
        { label: 'Pipelines',           value: String(kpis.pipelines) },
        { label: 'Auto-Cases Created',  value: String(kpis.cases), tone: 'text-status-cob' },
        { label: 'Auto-Disputes',       value: String(kpis.disputes), tone: 'text-status-paid' },
        { label: 'Automation Value',    value: formatCentsCompact(kpis.totalValue), tone: 'amount-positive' },
        { label: 'Success Rate',        value: jobs.length ? `${(kpis.successRate * 100).toFixed(0)}%` : '—' },
      ]} />

      <ScrollBody>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-4">
            <Panel title="Run Individual Job" action={
              <span className="text-[11px] text-muted-foreground">Reuses authoritative engines</span>
            }>
              <div className="grid grid-cols-2 gap-2">
                {JOB_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => handleSingle(t)}
                    disabled={!canRun || running}
                    className="text-left rounded border bg-muted/30 hover:bg-muted/60 px-3 py-2 text-[12px] disabled:opacity-40"
                  >
                    <div className="font-medium text-foreground">{prettify(t)}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground">{t}</div>
                  </button>
                ))}
              </div>
              {!canRun && <div className="mt-3 text-[11px] text-muted-foreground">Analyst+ role required to run jobs.</div>}
            </Panel>

            <Panel title="Recent Job Activity" action={
              <Link to="/automation/jobs" className="text-[11.5px] text-primary hover:underline">All jobs</Link>
            }>
              {loading ? (
                <div className="text-[12px] text-muted-foreground">Loading…</div>
              ) : recent.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">No jobs have run yet. Trigger a pipeline above.</div>
              ) : (
                <div className="divide-y -my-2">
                  {recent.map(j => (
                    <div key={j.job_id} className="py-2 flex items-center justify-between gap-3 text-[12px]">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{prettify(j.job_type)}</div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">
                          {new Date(j.created_at).toLocaleString()} · {j.records_succeeded}/{j.records_processed} ok
                          {j.records_failed > 0 && ` · ${j.records_failed} failed`}
                        </div>
                      </div>
                      <StatusPill status={j.status} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Navigate">
              <div className="space-y-1.5">
                <NavCard to="/automation/jobs"    icon={<ListChecks className="h-3.5 w-3.5" />} label="Job Queue" sub="Live + pending jobs" />
                <NavCard to="/automation/rules"   icon={<Settings2 className="h-3.5 w-3.5" />} label="Automation Rules" sub="Trigger configurations" />
                <NavCard to="/automation/history" icon={<History className="h-3.5 w-3.5" />}   label="History" sub="Run log + outcomes" />
              </div>
            </Panel>
            <div className="rounded border bg-card p-3 text-[11px] text-muted-foreground leading-snug">
              Each job and pipeline writes to <span className="font-mono">ops_events</span> with org-scoped audit.
              Recovery value reflects underpayment dollars surfaced by automation.
            </div>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function prettify(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'completed' ? 'bg-status-paid/15 text-status-paid border-status-paid/30' :
    status === 'failed'    ? 'bg-status-denied/15 text-status-denied border-status-denied/30' :
    status === 'running'   ? 'bg-status-pending/15 text-status-pending border-status-pending/30' :
                             'bg-muted text-muted-foreground border-border';
  return <span className={`pill border ${cls}`}>{status}</span>;
}

function NavCard({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded border bg-muted/30 px-2.5 py-2 hover:bg-muted/60">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="text-[10.5px] text-muted-foreground">{sub}</div>
      </div>
      <Bot className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}
