import { useMemo, useState } from 'react';
import { adjudicateClaim, resetIdCounter } from '@/engine/calculation-engine';
import { demoClaims, demoAccumulators, demoContract, demoPlan, demoPriorOutcomes } from '@/data/demo-scenarios';
import type { AdjudicationRun } from '@/types/claim';
import type { TraceObject } from '@/types/trace';
import { ClaimList } from '@/components/admin/ClaimList';
import { AdjudicationPanel } from '@/components/admin/AdjudicationPanel';
import { TraceViewer } from '@/components/admin/TraceViewer';
import { StatsBar } from '@/components/admin/StatsBar';
import { Activity, Shield, Layers, GitBranch } from 'lucide-react';
import { StateDiagram } from '@/components/admin/StateDiagram';

interface AdjResult {
  claimId: string;
  run: AdjudicationRun;
  trace: TraceObject;
}

const Index = () => {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [showStateMachine, setShowStateMachine] = useState(false);

  // Run adjudication on all demo claims
  const adjResults = useMemo<AdjResult[]>(() => {
    resetIdCounter();
    return demoClaims.map(claim => {
      const acc = demoAccumulators[claim.member_id] ?? demoAccumulators['MEM-88421'];
      const priors = claim.ohi_indicators.length > 0
        ? demoPriorOutcomes.filter(po => claim.lines.some(l => l.line_id === po.claim_line_id))
        : [];
      const { run, trace } = adjudicateClaim(claim.lines, acc, demoContract, demoPlan, priors);
      return { claimId: claim.claim_id, run, trace };
    });
  }, []);

  const selectedResult = adjResults.find(r => r.claimId === selectedClaimId);
  const selectedClaim = demoClaims.find(c => c.claim_id === selectedClaimId);

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
            Core Admin OS v2.3
          </span>
        </div>
        <div className="flex items-center gap-4">
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

      {/* Stats */}
      <StatsBar adjResults={adjResults} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Claim List */}
        <div className="w-[420px] border-r overflow-y-auto">
          <ClaimList
            claims={demoClaims}
            adjResults={adjResults}
            selectedClaimId={selectedClaimId}
            onSelect={setSelectedClaimId}
          />
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto">
          {selectedResult && selectedClaim ? (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setShowStateMachine(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {showStateMachine ? 'Hide' : 'Show'} State Machine
                </button>
              </div>
              {showStateMachine && (
                <StateDiagram
                  currentStatus={selectedClaim.status}
                  claimId={selectedClaim.claim_id}
                  hasPrimacyConfirmation={selectedClaim.ohi_indicators.length > 0}
                  onClose={() => setShowStateMachine(false)}
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
    </div>
  );
};

export default Index;
