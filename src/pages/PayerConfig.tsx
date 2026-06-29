/**
 * PayerConfig — Phase 4B
 *
 * Manage payer-specific rules: timely filing windows,
 * appeal deadlines, portal URL, and documentation
 * checklist.  Managers and above can configure.
 *
 * Includes one-click seed of the BCBSM Michigan template.
 */
import { useState } from 'react';
import { usePayerConfigs, BCBSM_TEMPLATE, type PayerConfig } from '@/hooks/use-payer-configs';
import { RequireRole } from '@/components/auth/RequireRole';
import { PageHeader, KpiStrip, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Building2, Plus, Trash2, Save, Loader2, RefreshCw, FileText, Globe, Clock,
} from 'lucide-react';

export default function PayerConfig() {
  return (
    <RequireRole min="manager">
      <PayerConfigInner />
    </RequireRole>
  );
}

const EMPTY: Partial<PayerConfig> = {
  payer_name: '',
  payer_id: '',
  timely_filing_days: 365,
  appeal_deadline_days: 60,
  portal_url: '',
  documentation_checklist: [],
  notes: '',
};

function PayerConfigInner() {
  const { data: configs = [], isLoading, refetch, upsert, remove, seedBcbsm } = usePayerConfigs();
  const [selected, setSelected] = useState<Partial<PayerConfig> | null>(null);
  const [checklistInput, setChecklistInput] = useState('');

  const openNew = () => {
    setSelected({ ...EMPTY });
    setChecklistInput('');
  };

  const openEdit = (cfg: PayerConfig) => {
    setSelected({ ...cfg });
    setChecklistInput((cfg.documentation_checklist ?? []).join('\n'));
  };

  const handleSave = async () => {
    if (!selected?.payer_name?.trim()) {
      toast({ title: 'Payer name is required', variant: 'destructive' });
      return;
    }
    const checklist = checklistInput
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    try {
      await upsert.mutateAsync({
        ...selected,
        payer_name: selected.payer_name!,
        documentation_checklist: checklist,
      });
      toast({ title: 'Payer configuration saved' });
      setSelected(null);
    } catch (e) {
      toast({ title: 'Failed to save', description: String(e), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this payer configuration?')) return;
    try {
      await remove.mutateAsync(id);
      toast({ title: 'Payer configuration deleted' });
      if (selected?.payer_config_id === id) setSelected(null);
    } catch (e) {
      toast({ title: 'Failed to delete', description: String(e), variant: 'destructive' });
    }
  };

  const handleSeedBcbsm = async () => {
    try {
      await seedBcbsm.mutateAsync();
      toast({ title: 'BCBSM Michigan configuration loaded' });
    } catch (e) {
      toast({ title: 'Failed to seed BCBSM', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Payer Configuration"
        subtitle="Configure payer-specific rules, filing windows, and documentation requirements."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            {!configs.find(c => c.payer_name === BCBSM_TEMPLATE.payer_name) && (
              <Button size="sm" variant="outline" onClick={handleSeedBcbsm} disabled={seedBcbsm.isPending}>
                {seedBcbsm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Building2 className="h-3.5 w-3.5 mr-1.5" />}
                Load BCBSM defaults
              </Button>
            )}
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add payer
            </Button>
          </div>
        }
      />
      <KpiStrip tiles={[
        { label: 'Payers configured', value: String(configs.length) },
        { label: 'Avg timely filing', value: configs.length ? `${Math.round(configs.reduce((s, c) => s + c.timely_filing_days, 0) / configs.length)}d` : '—' },
        { label: 'Avg appeal deadline', value: configs.length ? `${Math.round(configs.reduce((s, c) => s + c.appeal_deadline_days, 0) / configs.length)}d` : '—' },
      ]} />
      <ScrollBody>
        <div className={`grid h-full ${selected ? 'grid-cols-[320px_1fr]' : 'grid-cols-1'}`}>
          {/* List */}
          <div className={`${selected ? 'border-r' : ''} bg-card overflow-y-auto`}>
            {isLoading ? (
              <div className="p-4 text-[12px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : configs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No payer configurations"
                  body='Click "Load BCBSM defaults" or "Add payer" to configure your first payer.'
                  icon={<Building2 className="h-5 w-5" />}
                />
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                  Configured Payers
                </div>
                {configs.map(cfg => {
                  const isActive = selected?.payer_config_id === cfg.payer_config_id;
                  return (
                    <button
                      key={cfg.payer_config_id}
                      onClick={() => openEdit(cfg)}
                      className={`w-full text-left px-3 py-2.5 border-b text-[12.5px] ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}
                    >
                      <div className="font-medium text-foreground truncate">{cfg.payer_name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">
                        Filing {cfg.timely_filing_days}d · Appeal {cfg.appeal_deadline_days}d
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Edit form */}
          {selected && (
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  {selected.payer_config_id ? 'Edit payer' : 'New payer'}
                </h2>
                <div className="flex gap-2">
                  {selected.payer_config_id && (
                    <Button
                      size="sm" variant="outline"
                      className="text-status-denied border-status-denied/30 hover:bg-status-denied/5"
                      onClick={() => handleDelete(selected.payer_config_id!)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
                    {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Payer Identity</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <FormField label="Payer name *">
                    <Input value={selected.payer_name ?? ''} onChange={(e) => setSelected({ ...selected, payer_name: e.target.value })} className="h-8 text-[12.5px]" placeholder="Blue Cross Blue Shield of Michigan" />
                  </FormField>
                  <FormField label="Payer ID (internal/EDI)">
                    <Input value={selected.payer_id ?? ''} onChange={(e) => setSelected({ ...selected, payer_id: e.target.value })} className="h-8 text-[12.5px] font-mono" placeholder="MIBCBS" />
                  </FormField>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Filing Windows</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <FormField label="Timely filing (days)">
                    <Input type="number" min="1" value={selected.timely_filing_days ?? 365} onChange={(e) => setSelected({ ...selected, timely_filing_days: parseInt(e.target.value) || 365 })} className="h-8 text-[12.5px] font-mono" />
                  </FormField>
                  <FormField label="Appeal deadline (days)">
                    <Input type="number" min="1" value={selected.appeal_deadline_days ?? 60} onChange={(e) => setSelected({ ...selected, appeal_deadline_days: parseInt(e.target.value) || 60 })} className="h-8 text-[12.5px] font-mono" />
                  </FormField>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4" /> Portal & Contact</CardTitle></CardHeader>
                <CardContent>
                  <FormField label="Portal URL">
                    <Input value={selected.portal_url ?? ''} onChange={(e) => setSelected({ ...selected, portal_url: e.target.value })} className="h-8 text-[12.5px]" placeholder="https://portal.payer.com" />
                  </FormField>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documentation Checklist</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">One checklist item per line.</p>
                  <Textarea
                    value={checklistInput}
                    onChange={(e) => setChecklistInput(e.target.value)}
                    rows={7}
                    className="text-[12.5px] font-mono"
                    placeholder={'Completed CMS-1500\nItemized billing statement\nMedical records'}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={selected.notes ?? ''}
                    onChange={(e) => setSelected({ ...selected, notes: e.target.value })}
                    rows={3}
                    className="text-[12.5px]"
                    placeholder="Any additional guidance for billers…"
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollBody>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10.5px] font-semibold uppercase tracking-wide">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
