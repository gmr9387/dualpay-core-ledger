import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader, ScrollBody, Panel } from '@/components/clarity/primitives';
import { useAutomationRules } from '@/hooks/use-automation';
import { createRule, setRuleEnabled, deleteRule } from '@/lib/automation';
import { useOrg } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';
import type { RuleTriggerType } from '@/types/automation';

const TRIGGER_OPTIONS: Array<{ id: RuleTriggerType; label: string; defaultConfig: Record<string, unknown> }> = [
  { id: 'underpayment_threshold', label: 'Underpayment > threshold', defaultConfig: { min_variance_cents: 50000, actions: ['auto_case', 'assign_manager'] } },
  { id: 'sla_risk',               label: 'SLA breach risk',           defaultConfig: { hours_remaining: 12, actions: ['escalate', 'assign_manager'] } },
  { id: 'evidence_stale',         label: 'Evidence stale > N days',   defaultConfig: { max_age_days: 7, actions: ['escalate'] } },
  { id: 'denial_severity',        label: 'High-severity denial',      defaultConfig: { min_severity: 'high', actions: ['auto_case'] } },
  { id: 'repeat_payer_issue',     label: 'Repeat payer issue',        defaultConfig: { min_count: 3, actions: ['escalate'] } },
];

export default function AutomationRules() {
  const { rules, loading, refresh } = useAutomationRules();
  const { currentOrg } = useOrg();
  const canManage = currentOrg ? roleAtLeast(currentOrg.role, 'manager') : false;
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<RuleTriggerType>('underpayment_threshold');

  const handleCreate = async () => {
    if (!name.trim()) return;
    const def = TRIGGER_OPTIONS.find(o => o.id === trigger)!;
    await createRule({ rule_name: name.trim(), trigger_type: trigger, configuration: def.defaultConfig });
    setName('');
    refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Automation Rules" subtitle="Configurable triggers that drive auto-actions. Managers+ may edit." />
      <ScrollBody>
        <div className="p-5 space-y-4">
          {canManage && (
            <Panel title="Create Rule">
              <div className="grid grid-cols-[1fr_220px_auto] gap-2">
                <input
                  className="rounded border bg-background px-2.5 py-1.5 text-[12px]"
                  placeholder="Rule name (e.g. Underpayment > $500)"
                  value={name} onChange={e => setName(e.target.value)}
                />
                <select className="rounded border bg-background px-2 py-1.5 text-[12px]"
                  value={trigger} onChange={e => setTrigger(e.target.value as RuleTriggerType)}>
                  {TRIGGER_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button onClick={handleCreate}
                  className="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground text-[12px] px-3 py-1.5 hover:opacity-90">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              <div className="mt-2 text-[10.5px] text-muted-foreground">
                Default config is applied; edit via SQL/console for now. Actions include auto_case, assign_manager, escalate.
              </div>
            </Panel>
          )}

          <Panel title="Rules">
            {loading ? <div className="text-[12px] text-muted-foreground">Loading…</div> :
             rules.length === 0 ? <div className="text-[12px] text-muted-foreground">No rules yet.</div> : (
              <div className="divide-y -my-2">
                {rules.map(r => (
                  <div key={r.rule_id} className="py-2.5 flex items-center justify-between gap-3 text-[12px]">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{r.rule_name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">
                        {r.trigger_type} · triggered {r.trigger_count}× · last {r.last_triggered_at ? new Date(r.last_triggered_at).toLocaleDateString() : 'never'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={r.enabled} disabled={!canManage}
                          onChange={e => setRuleEnabled(r.rule_id, e.target.checked).then(refresh)} />
                        enabled
                      </label>
                      {canManage && (
                        <button onClick={() => deleteRule(r.rule_id).then(refresh)}
                          className="text-status-denied hover:opacity-80"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </ScrollBody>
    </div>
  );
}
