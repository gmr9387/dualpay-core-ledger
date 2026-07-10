/**
 * Denial Command Center — provider-side denial operations workspace.
 * Drill, filter, route, assign, and act on every open denial.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, allDenials, formatCents, formatCentsCompact, relativeTime, slaStatus } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, SeverityBadge, OwnerChip, RecoverabilityBar, EmptyState } from '@/components/clarity/primitives';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import type { DenialCategory, DenialSeverity } from '@/types/clarity';
import { AlertOctagon, Filter, Loader2, Search, Target, Clock } from 'lucide-react';
import { useAssignments } from '@/hooks/use-assignments';

const CATEGORIES: ('all' | DenialCategory)[] = ['all', 'authorization', 'eligibility', 'cob', 'modifier', 'duplicate', 'medical_necessity', 'missing_documentation', 'timely_filing', 'contractual', 'bundled', 'coding', 'coverage', 'underpayment'];
const SEVS: ('all' | DenialSeverity)[] = ['all', 'critical', 'high', 'medium', 'low'];
type RecBand = 'all' | 'high' | 'medium' | 'low';

export default function DenialIntelligence() {
  const { data: claims, isLoading } = useClarityData();
  const { get, assign, assignees } = useAssignments();
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('all');
  const [severity, setSeverity] = useState<typeof SEVS[number]>('all');
  const [recBand, setRecBand] = useState<RecBand>('all');
  const [appealOnly, setAppealOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [highRecoveryView, setHighRecoveryView] = useState(false);

  const denials = useMemo(() => (claims ? allDenials(claims) : []), [claims]);

  const filtered = useMemo(() => {
    return denials.filter(({ claim, denial }) => {
      if (category !== 'all' && denial.category !== category) return false;
      if (severity !== 'all' && denial.severity !== severity) return false;
      if (appealOnly && !denial.appeal_eligible) return false;
      if (recBand === 'high' && denial.recoverability_score < 65) return false;
      if (recBand === 'medium' && (denial.recoverability_score < 35 || denial.recoverability_score >= 65)) return false;
      if (recBand === 'low' && denial.recoverability_score >= 35) return false;
      if (highRecoveryView) {
        const ev = denial.amount_cents * denial.recoverability_score / 100;
        if (ev < 50_000 || denial.recoverability_score < 60) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        if (!`${claim.claim_id} ${claim.intel.payer_name} ${claim.provider_name} ${denial.carc_code} ${denial.root_cause}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const aEv = a.denial.amount_cents * a.denial.recoverability_score / 100;
      const bEv = b.denial.amount_cents * b.denial.recoverability_score / 100;
      return bEv - aEv;
    });
  }, [denials, category, severity, recBand, appealOnly, query, highRecoveryView]);

  const kpis = useMemo(() => {
    const atRisk = denials.reduce((s, d) => s + d.denial.amount_cents, 0);
    const critical = denials.filter(d => d.denial.severity === 'critical').length;
    const recoverable = denials.filter(d => d.denial.recoverability_score >= 60)
      .reduce((s, d) => s + d.denial.amount_cents, 0);
    const expectedRecovery = denials.reduce((s, d) => s + Math.round(d.denial.amount_cents * d.denial.recoverability_score / 100), 0);
    return { atRisk, critical, recoverable, expectedRecovery, total: denials.length };
  }, [denials]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Denial Command Center"
        subtitle="CARC/RARC-driven denial taxonomy with recoverability scoring, routing, and ownership."
        actions={
          <button
            onClick={() => setHighRecoveryView(v => !v)}
            className={`h-8 px-3 inline-flex items-center gap-1.5 text-[12px] rounded-md border transition-colors ${
              highRecoveryView
                ? 'bg-status-paid text-white border-status-paid'
                : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            <Target className="h-3.5 w-3.5" /> High Recovery Opportunities
          </button>
        }
      />
      <KpiStrip tiles={[
        { label: 'Open Denials',           value: String(kpis.total) },
        { label: 'Critical Severity',      value: String(kpis.critical),                       tone: 'text-status-denied' },
        { label: 'At-Risk Reimbursement',  value: formatCents(kpis.atRisk),                    tone: 'amount-negative' },
        { label: 'High Recoverability',    value: formatCents(kpis.recoverable),               tone: 'amount-positive', sub: 'denials with ≥60% recovery' },
        { label: 'Expected Recovery',      value: formatCentsCompact(kpis.expectedRecovery),   tone: 'amount-positive', sub: 'dollar-weighted by score' },
      ]} />

      <div className="px-5 py-3 border-b bg-card flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by claim, payer, CARC, root cause…"
            className="w-full h-8 pl-8 pr-3 text-[12.5px] rounded-md bg-muted/60 border border-transparent focus:bg-card focus:border-input focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <FilterSelect label="Category" value={category} onChange={v => setCategory(v as never)} options={CATEGORIES.map(c => ({ value: c, label: c === 'all' ? 'All categories' : CATEGORY_LABEL[c] }))} />
        <FilterSelect label="Severity" value={severity} onChange={v => setSeverity(v as never)} options={SEVS.map(s => ({ value: s, label: s === 'all' ? 'All severities' : s }))} />
        <FilterSelect label="Recoverability" value={recBand} onChange={v => setRecBand(v as RecBand)} options={[
          { value: 'all', label: 'Any' },
          { value: 'high', label: 'HIGH (≥65)' },
          { value: 'medium', label: 'MEDIUM (35-64)' },
          { value: 'low', label: 'LOW (<35)' },
        ]} />
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={appealOnly} onChange={e => setAppealOnly(e.target.checked)} /> Appeal-eligible only
        </label>
        <span className="text-[11px] font-mono text-muted-foreground ml-auto">{filtered.length} of {denials.length}</span>
      </div>

      <ScrollBody>
        {filtered.length === 0 ? (
          <EmptyState title="No denials match filters" body="Loosen the filters or clear the search query." icon={<AlertOctagon className="h-5 w-5" />} />
        ) : (
          <div className="divide-y bg-card">
            <div className="sticky top-0 z-10 grid grid-cols-[110px_75px_1fr_120px_100px_100px_110px_140px_150px] gap-3 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
              <span>Claim</span><span>CARC</span><span>Root Cause</span><span>Category</span>
              <span>Severity</span><span>Owner</span><span>Recov.</span>
              <span className="text-right">At Risk · ≈Recover</span><span>SLA · Assignee</span>
            </div>
            {filtered.map(({ claim, denial }) => {
              const sla = slaStatus(claim.intel.sla_due_at);
              const slaCls = sla.tone === 'breach' ? 'text-status-denied' : sla.tone === 'warn' ? 'text-status-pending' : 'text-status-paid';
              const expectedRecover = Math.round(denial.amount_cents * denial.recoverability_score / 100);
              const a = get(claim.claim_id);
              return (
                <div key={denial.denial_id} className="grid grid-cols-[110px_75px_1fr_120px_100px_100px_110px_140px_150px] gap-3 items-center px-5 py-2.5 hover:bg-muted/40">
                  <Link to={`/denials/${claim.claim_id}`}>
                    <div className="font-mono text-[12px] font-semibold text-primary hover:underline">{claim.claim_id}</div>
                    <div className="text-[10.5px] text-muted-foreground truncate">{claim.intel.payer_name}</div>
                  </Link>
                  <div>
                    <div className="font-mono text-[12px] font-semibold text-foreground">{denial.carc_code}</div>
                    {denial.rarc_code && <div className="font-mono text-[10px] text-muted-foreground">{denial.rarc_code}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-foreground truncate">{denial.root_cause}</div>
                    <div className="text-[10.5px] text-muted-foreground truncate font-mono">{relativeTime(denial.occurred_at)} · {denial.appeal_eligible ? 'appeal eligible' : 'not appealable'}</div>
                  </div>
                  <span className="text-[11.5px] text-muted-foreground">{CATEGORY_LABEL[denial.category]}</span>
                  <SeverityBadge severity={denial.severity} />
                  <OwnerChip owner={denial.workflow_owner} />
                  <RecoverabilityBar score={denial.recoverability_score} />
                  <div className="text-right">
                    <div className="font-mono text-[12px] amount-negative tabular-nums">{formatCents(denial.amount_cents)}</div>
                    <div className="font-mono text-[11px] amount-positive tabular-nums">≈{formatCents(expectedRecover)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-[11px] font-mono flex items-center gap-1 ${slaCls}`}>
                      <Clock className="h-3 w-3" /> {sla.label}
                    </span>
                    <select
                      value={a.assignee ?? ''}
                      onChange={e => assign(claim.claim_id, e.target.value || null)}
                      onClick={e => e.stopPropagation()}
                      className="h-6 text-[10.5px] rounded border bg-card px-1 focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      <option value="">Unassigned</option>
                      {assignees.map(a => <option key={a.user_id} value={a.user_id}>{a.name} · {a.role}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollBody>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Filter className="h-3 w-3" /> {label}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 px-2 text-[11.5px] rounded border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
