/**
 * Appeal Packet Generator
 *
 * Deterministic builder that assembles claim details, denial details,
 * evidence checklist, attached documents, timeline, and recovery
 * opportunity summary into a Markdown packet.
 *
 * Reuses scoreEvidenceReadiness for the readiness verdict — does NOT
 * recompute completeness. When evidence is insufficient/missing, the
 * packet header reports "Appeal Packet Incomplete" and lists the gaps
 * rather than fabricating completeness.
 */
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { scoreEvidenceReadiness } from './evidence-readiness';
import type { EvidenceDocument } from '@/types/evidence';
import { formatCents } from '@/hooks/use-clarity-data';

export interface AppealPacket {
  claim_id: string;
  generated_at: string;
  complete: boolean;
  readiness_tier: string;
  readiness_score: number;
  blocking_items: string[];
  missing_items: string[];
  attached_documents: EvidenceDocument[];
  markdown: string;
}

export function generateAppealPacket(
  claim: Claim & { intel: ClaimIntel },
  allClaims: Array<Claim & { intel: ClaimIntel }>,
  documents: EvidenceDocument[],
): AppealPacket {
  const readiness = scoreEvidenceReadiness(claim, allClaims);
  const primary = claim.intel.denial_events[0];
  const complete = readiness.tier === 'READY' && readiness.blocking_items.length === 0;
  const now = new Date().toISOString();

  const lines: string[] = [];
  lines.push(`# Appeal Packet — Claim ${claim.claim_id}`);
  lines.push(``);
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Status:** ${complete ? '✅ Appeal Packet Complete' : '⚠️ Appeal Packet Incomplete'}`);
  lines.push(`**Evidence Readiness:** ${readiness.tier} (${readiness.score}%)`);
  lines.push(``);

  if (!complete) {
    lines.push(`## ⚠️ Incomplete — Do Not Submit Without Review`);
    if (readiness.blocking_items.length) {
      lines.push(`**Blocking gaps:**`);
      for (const b of readiness.blocking_items) lines.push(`- ${b}`);
    }
    if (readiness.items_missing.length) {
      lines.push(`**All missing items:**`);
      for (const m of readiness.items_missing) lines.push(`- ${m.label} (${m.source})`);
    }
    lines.push(``);
  }

  lines.push(`## Claim`);
  lines.push(`- **Claim ID:** ${claim.claim_id}`);
  lines.push(`- **Payer:** ${claim.intel.payer_name} (${claim.intel.payer_id})`);
  lines.push(`- **Submitted:** ${claim.intel.submitted_at}`);
  lines.push(`- **Aging:** ${claim.intel.aging_days}d (${claim.intel.aging_bucket})`);
  lines.push(`- **State:** ${claim.intel.reimbursement_state}`);
  lines.push(`- **Expected:** ${formatCents(claim.intel.expected_reimbursement_cents)}`);
  lines.push(`- **Actual:** ${formatCents(claim.intel.actual_reimbursement_cents)}`);
  lines.push(`- **At Risk:** ${formatCents(claim.intel.amount_at_risk_cents)}`);
  lines.push(``);

  if (primary) {
    lines.push(`## Denial`);
    lines.push(`- **CARC:** ${primary.carc_code}${primary.rarc_code ? ` / RARC ${primary.rarc_code}` : ''}`);
    lines.push(`- **Group:** ${primary.group_code}`);
    lines.push(`- **Category:** ${primary.category}`);
    lines.push(`- **Severity:** ${primary.severity}`);
    lines.push(`- **Recoverability:** ${primary.recoverability_score}%`);
    lines.push(`- **Root Cause:** ${primary.root_cause}`);
    lines.push(`- **Recommended Action:** ${primary.recommended_action}`);
    if (primary.payer_message) lines.push(`- **Payer Message:** ${primary.payer_message}`);
    lines.push(``);
  }

  lines.push(`## Evidence Checklist`);
  for (const item of readiness.items_satisfied) lines.push(`- [x] ${item.label} *(${item.source})*`);
  for (const item of readiness.items_missing)   lines.push(`- [ ] ${item.label} *(${item.source}${item.blocking ? ', BLOCKING' : ''})*`);
  lines.push(``);

  lines.push(`## Attached Documents (${documents.length})`);
  if (documents.length === 0) {
    lines.push(`_No documents attached._`);
  } else {
    for (const d of documents) {
      lines.push(`- **${d.document_type}** — ${d.filename} (v${d.version}, ${(d.file_size / 1024).toFixed(1)} KB) — uploaded ${d.uploaded_at}`);
    }
  }
  lines.push(``);

  lines.push(`## Timeline`);
  for (const ev of claim.intel.timeline.slice(0, 20)) {
    lines.push(`- ${ev.occurred_at} — **${ev.kind}** — ${ev.description}${ev.actor ? ` (${ev.actor})` : ''}`);
  }
  lines.push(``);

  lines.push(`## Recovery Opportunity`);
  lines.push(`- **Recoverability Score:** ${claim.intel.recoverability_score}%`);
  lines.push(`- **At Risk:** ${formatCents(claim.intel.amount_at_risk_cents)}`);
  lines.push(`- **Underpayment:** ${formatCents(claim.intel.underpayment_cents)}`);
  lines.push(`- **Workflow Owner:** ${claim.intel.workflow_owner}`);
  lines.push(`- **SLA Due:** ${claim.intel.sla_due_at}`);
  lines.push(``);

  lines.push(`## Readiness Basis`);
  for (const b of readiness.basis) lines.push(`- ${b}`);

  return {
    claim_id: claim.claim_id,
    generated_at: now,
    complete,
    readiness_tier: readiness.tier,
    readiness_score: readiness.score,
    blocking_items: readiness.blocking_items,
    missing_items: readiness.items_missing.map(i => i.label),
    attached_documents: documents,
    markdown: lines.join('\n'),
  };
}
