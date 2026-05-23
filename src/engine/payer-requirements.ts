/**
 * Payer Requirement Profiles
 *
 * Static + derived profiles for each payer: appeal deadlines,
 * documentation expectations, submission channels, common denial
 * causes, historical overturn rates.  Surfaced inside workflows
 * (packet builder, appeal drafting, next-best-action).
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { buildPayerProfiles } from './payer-profile';

export interface PayerRequirements {
  payer_id: string;
  payer_name: string;
  payer_class: ClaimIntel['payer_class'];
  appeal_deadlines: {
    level_1_days: number;
    level_2_days: number;
    external_review_days: number;
  };
  submission_channels: Array<{ channel: 'edi_837' | 'portal' | 'fax' | 'mail'; preferred: boolean; address?: string }>;
  documentation_expectations: string[];
  common_denial_causes: string[];
  overturn_rate: number; // 0-1, derived from observed appeals
  timely_filing_days: number;
  notes: string[];
}

const STATIC_PROFILES: Record<string, Partial<PayerRequirements>> = {
  default_commercial: {
    appeal_deadlines: { level_1_days: 180, level_2_days: 60, external_review_days: 60 },
    submission_channels: [
      { channel: 'portal', preferred: true },
      { channel: 'fax', preferred: false },
      { channel: 'mail', preferred: false },
    ],
    documentation_expectations: ['Itemised bill', 'Clinical notes', 'Op note (surgical)', 'Authorization reference'],
    timely_filing_days: 365,
    notes: ['Confirm appeal level on payer portal before drafting.'],
  },
  default_medicare: {
    appeal_deadlines: { level_1_days: 120, level_2_days: 180, external_review_days: 60 },
    submission_channels: [
      { channel: 'mail', preferred: true, address: 'MAC Appeals (region-specific)' },
      { channel: 'portal', preferred: false },
    ],
    documentation_expectations: ['Redetermination request form (CMS-20027)', 'Itemised bill', 'Medical records', 'Provider statement'],
    timely_filing_days: 365,
    notes: ['Use CMS-20027 for Level 1 (Redetermination).', 'Five-level appeal ladder: Redetermination → Reconsideration → ALJ → MAC → Federal court.'],
  },
  default_medicaid: {
    appeal_deadlines: { level_1_days: 90, level_2_days: 30, external_review_days: 120 },
    submission_channels: [
      { channel: 'portal', preferred: true },
      { channel: 'mail', preferred: false },
    ],
    documentation_expectations: ['State-specific appeal form', 'Medical records', 'Plan benefit reference', 'Eligibility verification'],
    timely_filing_days: 180,
    notes: ['State Medicaid agencies vary — confirm filing window per state.', 'Stricter documentation reviews than commercial.'],
  },
};

export function buildPayerRequirements(
  claims: Array<Claim & { intel: ClaimIntel }>,
): PayerRequirements[] {
  const profiles = buildPayerProfiles(claims);
  return profiles.map(p => {
    const tmplKey = p.payer_class === 'medicare' ? 'default_medicare'
                   : p.payer_class === 'medicaid' ? 'default_medicaid'
                   : 'default_commercial';
    const tmpl = STATIC_PROFILES[tmplKey]!;

    return {
      payer_id: p.payer_id,
      payer_name: p.payer_name,
      payer_class: p.payer_class,
      appeal_deadlines: tmpl.appeal_deadlines!,
      submission_channels: tmpl.submission_channels!,
      documentation_expectations: [
        ...(tmpl.documentation_expectations ?? []),
        ...p.documentation_requirements.slice(0, 4),
      ].filter((v, i, a) => a.indexOf(v) === i),
      common_denial_causes: p.top_denial_reasons.map(r => r.category),
      overturn_rate: p.appeal_success_rate,
      timely_filing_days: tmpl.timely_filing_days!,
      notes: tmpl.notes ?? [],
    };
  });
}

export function findRequirementsFor(
  payerId: string,
  claims: Array<Claim & { intel: ClaimIntel }>,
): PayerRequirements | undefined {
  return buildPayerRequirements(claims).find(r => r.payer_id === payerId);
}
