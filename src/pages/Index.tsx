import { useEffect, useMemo, useState } from 'react';
import { adjudicateClaim, resetIdCounter } from '@/engine/calculation-engine';
import { demoContract, demoPlan, demoPriorOutcomes } from '@/data/demo-scenarios';
import {
  loadClaims, loadCases, loadCaseEvents, loadAccumulators, loadLatestRuns,
  saveAdjudication, seedIfEmpty,
} from '@/data/repository';
import type { Claim, AdjudicationRun, MemberAccumulators } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import type { Case, CaseEvent } from '@/types/case';
import { ClaimList } from '@/components/admin/ClaimList';
import { AdjudicationPanel } from '@/components/admin/AdjudicationPanel';
import { TraceViewer } from '@/components/admin/TraceViewer';
import { StatsBar } from '@/components/admin/StatsBar';
import { StateDiagram } from '@/components/admin/StateDiagram';
import { CasePanel } from '@/components/admin/CasePanel';
import { Activity, Shield, Layers, GitBranch, Briefcase, Database, Loader2 } from 'lucide-react';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

const Index = () => {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [showStateMachine, setShowStateMachine] = useState(false);
  const [showCasePanel, setShowCasePanel] = useState(false);

  const [loading, setLoading] = useState(true);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [caseEvents, setCaseEvents] = useState<CaseEvent[]>([]);
  const [accumulators, setAccumulators] = useState<Record<string, MemberAccumulators>>({});
  const [adjResults, setAdjResults] = useState<AdjResult[]>([]);

  // ── Hydrate from Lovable Cloud on mount ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { seeded } = await seedIfEmpty();
        if (cancelled) return;
        if (seeded) setSeedNotice('Seeded demo data into Lovable Cloud.');

        const [c, k, e, a, runs] = await Promise.all([
          loadClaims(), loadCases(), loadCaseEvents(),
          loadAccumulators(), loadLatestRuns(),
        ]);
        if (cancelled) return;

        setClaims(c);
        setCases(k);
        setCaseEvents(e);
        setAccumulators(a);

        // For any claim missing a persisted run, adjudicate fresh and save.
        resetIdCounter();
        const haveRun = new Set(runs.map(r => r.claimId));
        const fresh: AdjResult[] = [];
        for (const claim of c) {
          if (haveRun.has(claim.claim_id)) continue;
          const acc = a[claim.member_id] ?? Object.values(a)[0];
          if (!acc) continue;
          const priors = claim.ohi_indicators.length > 0
            ? demoPriorOutcomes.filter(po => claim.lines.some(l => l.line_id === po.claim_line_id))
            : [];
          const { run, trace } = adjudicateClaim(claim.lines, acc, demoContract, demoPlan, priors);
          fresh.push({ claimId: claim.claim_id, run, trace });
          await saveAdjudication(claim.claim_id, run, trace, false);
        }
        setAdjResults([...runs, ...fresh]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedResult = adjResults.find(r => r.claimId === selectedClaimId);
  const selectedClaim = claims.find(c => c.claim_id === selectedClaimId);
  const selectedCase = useMemo(() => {
    if (!selectedClaim) return null;
    if (selectedClaim.case_id) return cases.find(c => c.case_id === selectedClaim.case_id) ?? null;
    // Fallback: a case may link this claim without claim.case_id being set
    return cases.find(c => c.claim_ids.includes(selectedClaim.claim_id)) ?? null;
  }, [selectedClaim, cases]);
  const selectedCaseEvents = selectedCase
    ? caseEvents.filter(e => e.case_id === selectedCase.case_id)
    : [];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold tracking-tight text-foreground">DualPay</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground border-l pl-3 border-border">
            Core Admin OS v2.4
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5 text-status-paid" />
            <span className="font-mono">Cloud: PERSISTED</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-status-paid" />
            <span className="font-mono">Engine: ONLINE</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">CalcPolicy v1.0.0</span>
          </div>
        </div>
      </header>

      {seedNotice && (
        <div className="px-6 py-2 text-xs font-mono text-status-paid bg-status-paid/5 border-b border-status-paid/20">
          {seedNotice}
        </div>
      )}
      {error && (
        <div className="px-6 py-2 text-xs font-mono text-destructive bg-destructive/5 border-b border-destructive/20">
          Cloud error: {error}
        </div>
      )}

      <StatsBar adjResults={adjResults} />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hydrating from Lovable Cloud…
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[420px] border-r overflow-y-auto">
            <ClaimList
              claims={claims}
              adjResults={adjResults}
              selectedClaimId={selectedClaimId}
              onSelect={setSelectedClaimId}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedResult && selectedClaim ? (
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowStateMachine(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {showStateMachine ? 'Hide' : 'Show'} State Machine
                  </button>
                  {selectedCase && (
                    <button
                      onClick={() => setShowCasePanel(v => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      {showCasePanel ? 'Hide' : 'Show'} Case ({selectedCase.case_id})
                    </button>
                  )}
                </div>

                {showStateMachine && (
                  <StateDiagram
                    currentStatus={selectedClaim.status}
                    claimId={selectedClaim.claim_id}
                    hasPrimacyConfirmation={selectedClaim.ohi_indicators.length > 0}
                    onClose={() => setShowStateMachine(false)}
                  />
                )}

                {showCasePanel && selectedCase && (
                  <CasePanel
                    caseData={selectedCase}
                    events={selectedCaseEvents}
                    claims={claims}
                    adjResults={adjResults}
                    accumulators={accumulators}
                    contract={demoContract}
                    plan={demoPlan}
                    priorOutcomes={demoPriorOutcomes}
                    onSelectClaim={setSelectedClaimId}
                  />
                )}

                <AdjudicationPanel claim={selectedClaim} run={selectedResult.run} onShowTrace={() => setShowTrace(true)} />
                {showTrace && (
                  <TraceViewer trace={selectedResult.trace} onClose={() => setShowTrace(false)} />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                  <Shield className="h-12 w-12 mx-auto opacity-20" />
                  <p className="text-sm">Select a claim to view adjudication details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
