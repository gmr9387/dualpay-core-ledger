import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseFeeScheduleCsv } from '@/engine/contract-import';
import { createContract, addFeeScheduleRows } from '@/lib/contracts';
import { useAuth } from '@/hooks/use-auth';
import { useOrg } from '@/hooks/use-org';
import { can } from '@/lib/role-permissions';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ContractUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const allowed = can.upload(currentOrg?.role);

  const [payerName, setPayerName] = useState('');
  const [contractName, setContractName] = useState('');
  const [contractType, setContractType] = useState('commercial');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [terminationDate, setTerminationDate] = useState('');
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rows: number; errors: number; contract_id?: string } | null>(null);

  if (!allowed) {
    return <div className="p-6 text-sm text-muted-foreground">Analyst role or higher required to upload contracts.</div>;
  }

  const onFile = async (f: File | null) => {
    if (!f) return;
    setCsvText(await f.text());
  };

  const submit = async () => {
    if (!payerName || !contractName || !effectiveDate) return;
    setBusy(true);
    const parsed = parseFeeScheduleCsv(csvText);
    const contract = await createContract({
      payer_name: payerName,
      contract_name: contractName,
      effective_date: effectiveDate,
      termination_date: terminationDate || null,
      contract_type: contractType,
      uploaded_by: user?.email ?? undefined,
    });
    let inserted = 0;
    if (contract && parsed.rows.length) {
      inserted = await addFeeScheduleRows(contract.contract_id, parsed.rows);
    }
    setResult({ rows: inserted, errors: parsed.errors.length, contract_id: contract?.contract_id });
    setBusy(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-bold">Upload Payer Contract</h1>
        <p className="text-[12.5px] text-muted-foreground">Create a new versioned contract with optional fee schedule.</p>
      </header>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payer Name *"><input value={payerName} onChange={e => setPayerName(e.target.value)} className="w-full h-9 px-2 rounded border bg-background text-[13px]" /></Field>
          <Field label="Contract Name *"><input value={contractName} onChange={e => setContractName(e.target.value)} className="w-full h-9 px-2 rounded border bg-background text-[13px]" /></Field>
          <Field label="Effective Date *"><input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="w-full h-9 px-2 rounded border bg-background text-[13px]" /></Field>
          <Field label="Termination Date"><input type="date" value={terminationDate} onChange={e => setTerminationDate(e.target.value)} className="w-full h-9 px-2 rounded border bg-background text-[13px]" /></Field>
          <Field label="Contract Type">
            <select value={contractType} onChange={e => setContractType(e.target.value)} className="w-full h-9 px-2 rounded border bg-background text-[13px]">
              <option value="commercial">Commercial</option>
              <option value="medicare_advantage">Medicare Advantage</option>
              <option value="medicaid_mco">Medicaid MCO</option>
              <option value="workers_comp">Workers Comp</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="text-[12.5px] font-semibold">Fee Schedule (CSV — optional)</div>
        <div className="text-[11px] text-muted-foreground">Columns: procedure_code, modifier, contracted_amount, reimbursement_method</div>
        <input type="file" accept=".csv" onChange={e => onFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
        <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8}
          placeholder="procedure_code,modifier,contracted_amount,reimbursement_method&#10;99213,,125.00,fixed_fee"
          className="w-full font-mono text-[11px] p-2 rounded border bg-background" />
      </div>

      <div className="flex items-center justify-between">
        <button onClick={submit} disabled={busy || !payerName || !contractName}
          className="px-4 py-2 text-[13px] rounded-md bg-primary text-primary-foreground inline-flex items-center gap-2 disabled:opacity-50">
          <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : 'Create Contract'}
        </button>
        {result && (
          <div className="text-[12.5px] flex items-center gap-2">
            {result.errors === 0 ? <CheckCircle2 className="h-4 w-4 text-status-paid"/> : <AlertCircle className="h-4 w-4 text-status-pending"/>}
            <span>{result.rows} fee rows imported, {result.errors} errors.</span>
            {result.contract_id && (
              <button onClick={() => navigate(`/contracts/${result.contract_id}`)} className="text-primary underline">Open contract</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
