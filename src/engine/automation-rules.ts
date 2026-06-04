/**
 * Phase 16 — Recovery Rule Engine.
 *
 * Evaluates persisted automation_rules against live claim/dispute/event signals.
 * Each rule is deterministic and configurable.  No generated scores — only
 * threshold + boolean checks against existing engines' outputs.
 */
import { listRules, incrementRuleTrigger } from '@/lib/automation';
import { appendOpsEvent } from '@/lib/ops-events';
import { setAssignment } from '@/lib/assignments';
import { autoCreateCase } from './auto-case-generator';
import type { AutomationRule } from '@/types/automation';

export interface RuleSignal {
  claim_id: string;
  payer_name?: string;
  variance_cents?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  evidence_age_days?: number;
  sla_hours_remaining?: number;
  repeat_payer_count?: number;
}

export interface RuleEvalResult {
  rule_id: string;
  rule_name: string;
  triggered: boolean;
  actions_taken: string[];
}

function num(cfg: Record<string, unknown>, key: string, fallback: number): number {
  const v = cfg[key];
  return typeof v === 'number' ? v : fallback;
}

function matches(rule: AutomationRule, sig: RuleSignal): boolean {
  const cfg = rule.configuration ?? {};
  switch (rule.trigger_type) {
    case 'underpayment_threshold': {
      const thresholdCents = num(cfg, 'min_variance_cents', 50000);
      return (sig.variance_cents ?? 0) >= thresholdCents;
    }
    case 'sla_risk': {
      const hours = num(cfg, 'hours_remaining', 12);
      return (sig.sla_hours_remaining ?? Infinity) <= hours;
    }
    case 'evidence_stale': {
      const days = num(cfg, 'max_age_days', 7);
      return (sig.evidence_age_days ?? 0) > days;
    }
    case 'denial_severity': {
      const min = String(cfg.min_severity ?? 'high');
      const order = ['low', 'medium', 'high', 'critical'];
      return order.indexOf(sig.severity ?? 'low') >= order.indexOf(min);
    }
    case 'repeat_payer_issue': {
      const min = num(cfg, 'min_count', 3);
      return (sig.repeat_payer_count ?? 0) >= min;
    }
  }
}

async function applyActions(rule: AutomationRule, sig: RuleSignal): Promise<string[]> {
  const cfg = rule.configuration ?? {};
  const actions = (cfg.actions as string[] | undefined) ?? [];
  const taken: string[] = [];

  for (const a of actions) {
    try {
      if (a === 'auto_case') {
        const tr = rule.trigger_type === 'denial_severity' ? 'high_severity_denial'
                 : rule.trigger_type === 'underpayment_threshold' ? 'major_underpayment'
                 : 'repeat_payer_issue';
        await autoCreateCase({
          claim_id: sig.claim_id,
          trigger: tr,
          description: `Rule "${rule.rule_name}" auto-created case`,
        });
        taken.push('auto_case');
      } else if (a === 'assign_manager') {
        await setAssignment(sig.claim_id, { assignee: 'M. Alvarez (Appeals Lead)', status: 'open' });
        taken.push('assign_manager');
      } else if (a === 'escalate') {
        await appendOpsEvent({
          kind: 'escalation_raised',
          claim_id: sig.claim_id,
          summary: `Rule "${rule.rule_name}" escalated claim`,
          payload: { rule_id: rule.rule_id },
        });
        taken.push('escalate');
      }
    } catch (e) {
      console.error('[automation-rules] action failed', a, e);
    }
  }
  return taken;
}

export async function evaluateRules(sig: RuleSignal): Promise<RuleEvalResult[]> {
  const rules = (await listRules()).filter(r => r.enabled);
  const out: RuleEvalResult[] = [];
  for (const rule of rules) {
    if (!matches(rule, sig)) {
      out.push({ rule_id: rule.rule_id, rule_name: rule.rule_name, triggered: false, actions_taken: [] });
      continue;
    }
    const taken = await applyActions(rule, sig);
    await incrementRuleTrigger(rule.rule_id);
    await appendOpsEvent({
      kind: 'rule_triggered',
      claim_id: sig.claim_id,
      summary: `Rule triggered: ${rule.rule_name}`,
      payload: { rule_id: rule.rule_id, trigger_type: rule.trigger_type, actions: taken },
    });
    out.push({ rule_id: rule.rule_id, rule_name: rule.rule_name, triggered: true, actions_taken: taken });
  }
  return out;
}
