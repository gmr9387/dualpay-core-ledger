/**
 * Executive ROI Hook — Phase 3C Step 2
 *
 * Wires the /executive dashboard to live SQL-backed KPIs.
 * All queries are org-scoped and rely on RLS for row isolation.
 *
 * KPIs computed:
 *   1. Revenue Recovered This Month
 *   2. Revenue Recovered Last 90 Days
 *   3. Open Recovery Opportunity
 *   4. Top 5 Payers by Lost Revenue
 *   5. Appeal Win Rate
 *   6. Recovery Rate
 *   7. Assigned vs Unassigned Work
 *
 * Data sources:
 *   - recovery_outcomes  (columns: recovered_amount_cents, denied_amount_cents,
 *                         unrecovered_amount_cents, resolution_date, resolution_type,
 *                         payer_id, payload)
 *   - claims             (columns: claim_id, status, total_billed_cents)
 *   - claim_assignments  (columns: claim_id, assignee, status)
 *
 * Claim statuses stored in claims.status (ClaimStatus enum) that map to active
 * denial/recovery states (clarity-scenarios.ts lines 382-388):
 *   claims.status = 'DENIED'   ← intel.reimbursement_state = 'denied'
 *   claims.status = 'ADJUSTED' ← intel.reimbursement_state = 'partially_paid'
 *   claims.status = 'PENDED'   ← intel.reimbursement_state = 'appealing'
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';

export interface PayerLoss {
  payer_id: string;
  payer_name: string;
  lost_revenue_cents: number;   // unrecovered (denied - recovered)
  denied_cents: number;
  recovered_cents: number;
}

export interface ExecutiveROI {
  revenueRecoveredThisMonth: number;    // cents
  revenueRecovered90Days: number;       // cents
  openRecoveryOpportunity: number;      // cents
  topPayersByLostRevenue: PayerLoss[];  // top 5
  appealWinRate: number | null;         // 0–1, null when no appeal outcomes
  recoveryRate: number | null;          // 0–1, null when no outcomes
  assignedCount: number;
  unassignedCount: number;
  totalActiveWork: number;
  outcomeCount: number;
}

const OPEN_CLAIM_STATUSES = ['DENIED', 'ADJUSTED', 'PENDED'] as const;
const APPEAL_WIN  = 'appeal_won';
const APPEAL_LOST = 'appeal_lost';

async function fetchExecutiveROI(orgId: string): Promise<ExecutiveROI> {
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
  const days90Ago  = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Load all recovery_outcomes for the org ────────────────
  const { data: outcomes, error: outErr } = await supabase
    .from('recovery_outcomes')
    .select('recovered_amount_cents, denied_amount_cents, unrecovered_amount_cents, resolution_date, resolution_type, payer_id, payload')
    .eq('org_id', orgId);

  if (outErr) throw new Error(`recovery_outcomes: ${outErr.message}`);

  const rows = outcomes ?? [];

  // Revenue Recovered This Month
  const revenueRecoveredThisMonth = rows
    .filter(r => r.resolution_date >= monthStart)
    .reduce((s, r) => s + Number(r.recovered_amount_cents), 0);

  // Revenue Recovered Last 90 Days
  const revenueRecovered90Days = rows
    .filter(r => r.resolution_date >= days90Ago)
    .reduce((s, r) => s + Number(r.recovered_amount_cents), 0);

  // Appeal Win Rate
  const appealRows = rows.filter(r => r.resolution_type === APPEAL_WIN || r.resolution_type === APPEAL_LOST);
  const appealWins = appealRows.filter(r => r.resolution_type === APPEAL_WIN).length;
  const appealWinRate = appealRows.length > 0 ? appealWins / appealRows.length : null;

  // Recovery Rate
  const totalDenied    = rows.reduce((s, r) => s + Number(r.denied_amount_cents), 0);
  const totalRecovered = rows.reduce((s, r) => s + Number(r.recovered_amount_cents), 0);
  const recoveryRate   = totalDenied > 0 ? totalRecovered / totalDenied : null;

  // Top 5 Payers by Lost Revenue
  const payerMap = new Map<string, { payer_name: string; denied: number; recovered: number }>();
  for (const r of rows) {
    const pid   = r.payer_id ?? 'unknown';
    const name  = (r.payload as Record<string, unknown> | null)?.payer_name as string ?? pid;
    const entry = payerMap.get(pid) ?? { payer_name: name, denied: 0, recovered: 0 };
    entry.denied    += Number(r.denied_amount_cents);
    entry.recovered += Number(r.recovered_amount_cents);
    payerMap.set(pid, entry);
  }
  const topPayersByLostRevenue: PayerLoss[] = [...payerMap.entries()]
    .map(([payer_id, v]) => ({
      payer_id,
      payer_name: v.payer_name,
      lost_revenue_cents: Math.max(0, v.denied - v.recovered),
      denied_cents:    v.denied,
      recovered_cents: v.recovered,
    }))
    .sort((a, b) => b.lost_revenue_cents - a.lost_revenue_cents)
    .slice(0, 5);

  // ── 2. Open Recovery Opportunity from claims ─────────────────
  const { data: openClaims, error: claimErr } = await supabase
    .from('claims')
    .select('total_billed_cents')
    .eq('org_id', orgId)
    .in('status', OPEN_CLAIM_STATUSES);

  if (claimErr) throw new Error(`claims: ${claimErr.message}`);

  const openRecoveryOpportunity = (openClaims ?? [])
    .reduce((s, c) => s + Number(c.total_billed_cents), 0);

  // ── 3. Assigned vs Unassigned Work from claim_assignments ────
  const { data: assignments, error: asgErr } = await supabase
    .from('claim_assignments')
    .select('assignee, status')
    .eq('org_id', orgId)
    .in('status', ['open', 'in_progress']);

  if (asgErr) throw new Error(`claim_assignments: ${asgErr.message}`);

  const asgRows = assignments ?? [];
  const assignedCount   = asgRows.filter(a => !!a.assignee).length;
  const unassignedCount = asgRows.filter(a => !a.assignee).length;

  return {
    revenueRecoveredThisMonth,
    revenueRecovered90Days,
    openRecoveryOpportunity,
    topPayersByLostRevenue,
    appealWinRate,
    recoveryRate,
    assignedCount,
    unassignedCount,
    totalActiveWork: asgRows.length,
    outcomeCount: rows.length,
  };
}

export function useExecutiveROI() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id ?? null;

  return useQuery({
    queryKey: ['executive-roi', orgId],
    queryFn: () => fetchExecutiveROI(orgId!),
    enabled: !!orgId,
    staleTime: 2 * 60_000,   // 2 min — executive page doesn't need real-time refresh
    retry: 2,
  });
}
