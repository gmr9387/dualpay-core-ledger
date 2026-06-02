/**
 * Recovery Outcome — Phase 5 Outcome Intelligence
 *
 * Captures the terminal state of a denied claim so the platform can
 * measure recovery rate, calibrate its own predictions, and rank
 * payers / playbooks / teams by actual financial result.
 */
import type { DenialCategory, WorkflowOwner } from './clarity';

export type ResolutionType =
  | 'recovered_full'
  | 'recovered_partial'
  | 'appeal_won'
  | 'appeal_lost'
  | 'corrected_and_paid'
  | 'resubmitted_and_paid'
  | 'written_off'
  | 'patient_responsibility'
  | 'duplicate_closed';

export const RESOLUTION_LABEL: Record<ResolutionType, string> = {
  recovered_full:        'Recovered (full)',
  recovered_partial:     'Recovered (partial)',
  appeal_won:            'Appeal won',
  appeal_lost:           'Appeal lost',
  corrected_and_paid:    'Corrected & paid',
  resubmitted_and_paid:  'Resubmitted & paid',
  written_off:           'Written off',
  patient_responsibility:'Patient responsibility',
  duplicate_closed:      'Duplicate closed',
};

export const RECOVERED_RESOLUTIONS: ResolutionType[] = [
  'recovered_full', 'recovered_partial', 'appeal_won',
  'corrected_and_paid', 'resubmitted_and_paid',
];

export interface RecoveryOutcome {
  outcome_id: string;
  claim_id: string;
  denial_id?: string;
  payer_id: string;
  payer_name: string;
  category: DenialCategory;
  workflow_owner: WorkflowOwner;
  playbook_used?: DenialCategory;     // playbook key
  resolution_type: ResolutionType;

  // Financial
  denied_amount_cents: number;
  recovered_amount_cents: number;
  unrecovered_amount_cents: number;

  // Timing
  denial_date: string;
  resolution_date: string;
  days_to_resolution: number;

  // Calibration
  predicted_recoverability_score: number; // 0-100 at the time of denial

  notes?: string;
  created_at: string;
  updated_at: string;
}
