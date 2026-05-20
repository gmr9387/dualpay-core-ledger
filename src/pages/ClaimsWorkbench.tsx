/**
 * Claims Workbench — refactored from legacy DualPay Index.
 * Provides the deep adjudication / trace / state machine / case view
 * for individual claims as a secondary surface to Claim Clarity.
 */
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
import { StatsBar } from '@/components/admin/StatsBar';
import { ClaimWorkspace } from '@/components/admin/ClaimWorkspace';
import { PageHeader, EmptyState } from '@/components/clarity/primitives';
import { Inbox, Loader2 } from 'lucide-react';

interface AdjResult { claimId: string; run: AdjudicationRun; trace: TraceObject; }

export default function ClaimsWorkbench() {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [caseEvents, setCaseEvents] = useState<CaseEvent[]>([]);
  const [accumulators, setAccumulators] = useState<Record<string, MemberAccumulators>>({});
  const [adjResults, setAdjResults] = useState<AdjResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfEmpty();
        const [c, k, e, a, runs] = await Promise.all([
          loadClaims(), loadCases(), loadCaseEvents(), loadAccumulators(), loadLatestRuns(),
        ]);
        if (cancelled) return;
        setClaims(c); setCases(k); setCaseEvents(e); setAccumulators(a);
        resetIdCounter();
        const haveRun = new Set(runs.map(r => r.claimId));
        const fresh: AdjResult[] = [];
        for (const claim of c) {
          if (haveRun.has(claim.claim_id)) continue;
          const acc = a[claim.member_id] ?? Object.values(a)[0];
          if (!acc) continue;
          const { run, trace } = adjudicateClaim(claim.lines, acc, demoContract, demoPlan, demoPriorOutcomes);
          fresh.push({ claimId: claim.claim_id, run, trace });
          await saveAdjudication(claim.claim_id, run, trace, false);
        }
        setAdjResults([...runs, ...fresh]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
    return cases.find(c => c.claim_ids.includes(selectedClaim.claim_id)) ?? null;
  }, [selectedClaim, cases]);
  const selectedCaseEvents = selectedCase ? caseEvents.filter(e => e.case_id === selectedCase.case_id) : [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Claims Workbench" subtitle="Adjudication engine view: trace, state machine, COB, and case management." />
      {error && <div className="px-5 py-1.5 text-[11.5px] font-mono border-b text-destructive">Error: {error}</div>}
      <StatsBar adjResults={adjResults} />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading adjudication data…
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-[340px] shrink-0 border-r overflow-hidden">
            <ClaimList claims={claims} adjResults={adjResults} selectedClaimId={selectedClaimId} onSelect={setSelectedClaimId} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            {selectedResult && selectedClaim ? (
              <ClaimWorkspace
                claim={selectedClaim} result={selectedResult}
                caseData={selectedCase} caseEvents={selectedCaseEvents}
                claims={claims} adjResults={adjResults} accumulators={accumulators}
                contract={demoContract} plan={demoPlan} priorOutcomes={demoPriorOutcomes}
                onSelectClaim={setSelectedClaimId}
              />
            ) : (
              <EmptyState title="Select a claim to begin" body="Pick a claim from the queue to view adjudication, COB allocation, trace, and case." icon={<Inbox className="h-5 w-5" />} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
