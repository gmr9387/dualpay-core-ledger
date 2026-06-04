/**
 * Playbook Effectiveness Engine — Phase 11
 *
 * Ranks recovery playbooks using only persisted outcome history.
 * Reuses the canonical outcome shape and the playbook keys already
 * emitted by the playbook engine (DenialCategory).
 */
import type { RecoveryOutcome } from '@/types/outcomes';
import { RECOVERED_RESOLUTIONS } from '@/types/outcomes';
import type { DenialCategory } from '@/types/clarity';
import { CATEGORY_LABEL } from '@/engine/outcome-analytics';

export const MIN_SAMPLE = 5;

export interface PlaybookEffectiveness {
  playbook: DenialCategory;
  label: string;
  usage_count: number;
  recovery_rate: number;
  avg_recovered_cents: number;
  total_recovered_cents: number;
  avg_resolution_days: number;
  appeal_success_rate: number;
  insufficient: boolean;
}

export function rankPlaybooks(outcomes: RecoveryOutcome[]): PlaybookEffectiveness[] {
  const m = new Map<DenialCategory, RecoveryOutcome[]>();
  for (const o of outcomes) {
    const k = (o.playbook_used ?? o.category) as DenialCategory;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  const out: PlaybookEffectiveness[] = [];
  for (const [pb, arr] of m) {
    const denied = arr.reduce((s, o) => s + o.denied_amount_cents, 0);
    const recovered = arr.reduce((s, o) => s + o.recovered_amount_cents, 0);
    const wins = arr.filter(o => RECOVERED_RESOLUTIONS.includes(o.resolution_type));
    const appeals = arr.filter(o => o.resolution_type === 'appeal_won' || o.resolution_type === 'appeal_lost');
    const appealWins = appeals.filter(o => o.resolution_type === 'appeal_won');
    out.push({
      playbook: pb, label: CATEGORY_LABEL[pb] ?? String(pb),
      usage_count: arr.length,
      recovery_rate: denied ? recovered / denied : 0,
      avg_recovered_cents: wins.length ? recovered / wins.length : 0,
      total_recovered_cents: recovered,
      avg_resolution_days: arr.length ? arr.reduce((s, o) => s + o.days_to_resolution, 0) / arr.length : 0,
      appeal_success_rate: appeals.length ? appealWins.length / appeals.length : 0,
      insufficient: arr.length < MIN_SAMPLE,
    });
  }
  return out.sort((a, b) => b.recovery_rate - a.recovery_rate);
}
