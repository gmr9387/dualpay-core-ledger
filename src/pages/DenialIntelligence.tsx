import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClarityData, allDenials, formatCents, relativeTime } from '@/hooks/use-clarity-data';
import { PageHeader, KpiStrip, ScrollBody, SeverityBadge, OwnerChip, RecoverabilityBar, EmptyState } from '@/components/clarity/primitives';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';
import type { DenialCategory, DenialSeverity } from '@/types/clarity';
import { AlertOctagon, Filter, Loader2, Search } from 'lucide-react';

const CATEGORIES: ('all' | DenialCategory)[] = ['all', 'authorization', 'eligibility', 'cob', 'modifier', 'duplicate', 'medical_necessity', 'missing_documentation', 'timely_filing', 'contractual', 'bundled', 'coding', 'coverage', 'underpayment'];
const SEVS: ('all' | DenialSeverity)[] = ['all', 'critical', 'high', 'medium', 'low'];

export default function DenialIntelligence() {
  const { data: claims, isLoading } = useClarityData();
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('all');
  const [severity, setSeverity] = useState<typeof SEVS[number]>('all');
  const [query, setQuery] = useState('');

  const denials = useMemo(() => (claims ? allDenials(claims) : []), [claims]);

  const filtered = useMemo(() => {
    return denials.filter(({ claim, denial }) => {
      if (category !== 'all' && denial.category !== category) return false;
      if (severity !== 'all' && denial.severity !== severity) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${claim.claim_id} ${claim.intel.payer_name} ${claim.provider_name} ${denial.carc_code} ${denial.root_cause}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [denials, category, severity, query]);

  const kpis = useMemo(() => {
    const atRisk = denials.reduce((s, d) => s + d.denial.amount_cents, 0);
    const critical = denials.filter(d => d.denial.severity === 'critical').length;
    const recoverable = denials.filter(d => d.denial.recoverability_score >= 60)
      .reduce((s, d) => s + d.denial.amount_cents, 0);
    return { atRisk, critical, recoverable, total: denials.length };
  }, [denials]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Denial Intelligence"
        subtitle="CARC/RARC-driven denial taxonomy with recoverability scoring and routing recommendations."
      />
      <KpiStrip tiles={[
        { label: 'Open Denials',          value: String(kpis.total) },
        { label: 'Critical Severity',     value: String(kpis.critical),         tone: 'text-status-denied' },
        { label: 'At-Risk Reimbursement', value: formatCents(kpis.atRisk),       tone: 'amount-negative' },
        { label: 'Recoverable (≥60%)',    value: formatCents(kpis.recoverable),  tone: 'amount-positive' },
      ]} />

      <div className="px-5 py-3 border-b bg-card flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by claim, payer, CARC, root cause…"
            className="w-full h-8 pl-8 pr-3 text-[12.5px] rounded-md bg-muted/60 border border-transparent focus:bg-card focus:border-input focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <FilterSelect label="Category" value={category} onChange={v => setCategory(v as never)} options={CATEGORIES.map(c => ({ value: c, label: c === 'all' ? 'All categories' : CATEGORY_LABEL[c] }))} />
        <FilterSelect label="Severity" value={severity} onChange={v => setSeverity(v as never)} options={SEVS.map(s => ({ value: s, label: s === 'all' ? 'All severities' : s }))} />
        <span className="text-[11px] font-mono text-muted-foreground">{filtered.length} of {denials.length}</span>
      </div>

      <ScrollBody>
        {filtered.length === 0 ? (
          <EmptyState title="No denials match filters" body="Loosen the filters or clear the search query." icon={<AlertOctagon className="h-5 w-5" />} />
        ) : (
          <div className="divide-y bg-card">
            <div className="sticky top-0 z-10 grid grid-cols-[110px_85px_1fr_140px_120px_110px_120px] gap-3 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
              <span>Claim</span>
              <span>CARC</span>
              <span>Root Cause</span>
              <span>Category</span>
              <span>Owner</span>
              <span>Severity</span>
              <span className="text-right">At Risk</span>
            </div>
            {filtered.map(({ claim, denial }) => (
              <Link
                key={denial.denial_id}
                to={`/denials/${claim.claim_id}`}
                className="grid grid-cols-[110px_85px_1fr_140px_120px_110px_120px] gap-3 items-center px-5 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div>
                  <div className="font-mono text-[12px] font-semibold text-foreground">{claim.claim_id}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate">{claim.intel.payer_name}</div>
                </div>
                <div>
                  <div className="font-mono text-[12px] font-semibold text-foreground">{denial.carc_code}</div>
                  {denial.rarc_code && <div className="font-mono text-[10px] text-muted-foreground">{denial.rarc_code}</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] text-foreground truncate">{denial.root_cause}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate font-mono">{relativeTime(denial.occurred_at)}</div>
                </div>
                <span className="text-[11.5px] text-muted-foreground">{CATEGORY_LABEL[denial.category]}</span>
                <OwnerChip owner={denial.workflow_owner} />
                <SeverityBadge severity={denial.severity} />
                <div className="text-right">
                  <div className="font-mono text-[12.5px] amount-negative tabular-nums">{formatCents(denial.amount_cents)}</div>
                  <RecoverabilityBar score={denial.recoverability_score} />
                </div>
              </Link>
            ))}
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
