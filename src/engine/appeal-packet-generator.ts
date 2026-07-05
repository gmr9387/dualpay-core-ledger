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

// ─────────────────────────────────────────────────────────────────────────────
// PDF helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a fully self-contained HTML page that renders the appeal packet
 * in a print-ready layout.  Open it in a new tab and call window.print()
 * to let the user save as PDF.
 *
 * @param packet   Result of generateAppealPacket.
 * @param claim    The source claim (for structured field access).
 * @param allClaims  All loaded claims (needed to re-evaluate evidence readiness items).
 * @param meta     Optional display metadata (e.g. org name for the header).
 */
export function generateAppealPdfHtml(
  packet: AppealPacket,
  claim: Claim & { intel: ClaimIntel },
  allClaims: Array<Claim & { intel: ClaimIntel }>,
  meta?: { orgName?: string },
): string {
  const readiness = scoreEvidenceReadiness(claim, allClaims);
  const primary = claim.intel.denial_events[0];

  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const row2 = (l1: string, v1: unknown, l2: string, v2: unknown, mono = false): string => {
    const cls = mono ? ' class="mono"' : '';
    return `<tr><td class="lbl">${esc(l1)}</td><td${cls}>${esc(v1)}</td>`
      + `<td class="lbl">${esc(l2)}</td><td${cls}>${esc(v2)}</td></tr>`;
  };

  const row1 = (label: string, value: unknown): string =>
    `<tr><td class="lbl">${esc(label)}</td><td colspan="3">${esc(value)}</td></tr>`;

  const statusClass = packet.complete ? 'status-complete' : 'status-incomplete';
  const statusLabel = packet.complete
    ? '&#10003; Appeal Packet Complete'
    : '&#9888; INCOMPLETE &#8212; Review before submitting';

  const evidenceItems = [
    ...readiness.items_satisfied.map(
      i => `<li class="ok"><span class="chk">&#10003;</span>${esc(i.label)}`
        + `<span class="src"> (${esc(i.source)})</span></li>`,
    ),
    ...readiness.items_missing.map(
      i => `<li class="gap"><span class="chk">&#10007;</span>${esc(i.label)}`
        + `<span class="src"> (${esc(i.source)}${i.blocking ? ', BLOCKING' : ''})</span></li>`,
    ),
  ].join('\n');

  const timelineItems = claim.intel.timeline.slice(0, 20).map(ev =>
    `<tr><td class="ts mono">${esc(ev.occurred_at.slice(0, 10))}</td>`
      + `<td class="kind">${esc(ev.kind)}</td>`
      + `<td>${esc(ev.description)}${ev.actor ? `<span class="src"> (${esc(ev.actor)})</span>` : ''}</td></tr>`,
  ).join('\n');

  const docItems = packet.attached_documents.length > 0
    ? packet.attached_documents.map(d =>
      `<tr><td>${esc(d.document_type)}</td><td class="mono">${esc(d.filename)}</td>`
        + `<td>${esc(d.uploaded_at.slice(0, 10))}</td></tr>`,
    ).join('\n')
    : '<tr><td colspan="3" class="none">No documents attached.</td></tr>';

  const blockingHtml = !packet.complete && packet.blocking_items.length > 0
    ? `<div class="warn"><strong>Blocking gaps:</strong> ${packet.blocking_items.map(esc).join('; ')}</div>`
    : '';

  const denialHtml = primary
    ? `<section>
  <h2>Primary Denial</h2>
  <table><tbody>
    ${row2('CARC', primary.carc_code + (primary.rarc_code ? ' / RARC ' + primary.rarc_code : ''), 'Group Code', primary.group_code, true)}
    ${row2('Category', primary.category, 'Severity', primary.severity)}
    ${row2('Recoverability', primary.recoverability_score + '%', 'Amount at Risk', formatCents(primary.amount_cents), true)}
    ${row1('Root Cause', primary.root_cause)}
    ${row1('Recommended Action', primary.recommended_action)}
    ${primary.payer_message ? row1('Payer Message', primary.payer_message) : ''}
  </tbody></table>
</section>`
    : '';

  const timelineHtml = claim.intel.timeline.length > 0
    ? `<section>
  <h2>Timeline (${Math.min(claim.intel.timeline.length, 20)} of ${claim.intel.timeline.length} events)</h2>
  <table><tbody>${timelineItems}</tbody></table>
</section>`
    : '';

  const orgLabel = meta?.orgName ? ` &#183; ${esc(meta.orgName)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Appeal Packet &#8212; ${esc(claim.claim_id)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;background:#fff}
@page{size:letter;margin:.75in}
.wrap{max-width:7in;margin:0 auto;padding:20px 0}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1e3a8a;padding-bottom:10px;margin-bottom:16px}
.hdr h1{font-size:14pt;color:#1e3a8a;margin-bottom:3px}
.hdr .sub{font-size:8.5pt;color:#444}
.hdr .right{text-align:right;font-size:8.5pt;color:#444;line-height:1.6}
.badge{display:inline-block;font-size:9.5pt;font-weight:700;padding:3px 12px;border-radius:3px;margin-bottom:14px}
.status-complete{background:#d1fae5;color:#065f46;border:1px solid #6ee7b7}
.status-incomplete{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.warn{background:#fef3c7;border:1px solid #fcd34d;border-radius:3px;padding:7px 10px;margin-bottom:12px;font-size:9pt;color:#78350f}
section{margin-bottom:14px}
section h2{font-size:8.5pt;text-transform:uppercase;letter-spacing:.07em;color:#1e3a8a;border-bottom:1px solid #bfdbfe;padding-bottom:3px;margin-bottom:7px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
td{padding:3px 5px;vertical-align:top;line-height:1.4}
td.lbl{color:#555;font-weight:600;width:130px}
td.mono{font-family:"Courier New",Courier,monospace;font-size:9pt}
td.ts{width:80px}
td.kind{width:140px;font-weight:600}
td.none{color:#888;font-style:italic;padding:6px 5px}
ul.ev{list-style:none;padding:0}
ul.ev li{padding:2px 0;font-size:9.5pt;display:flex;align-items:baseline;gap:5px}
li.ok .chk{color:#065f46}
li.gap .chk{color:#991b1b}
li.ok{color:#065f46}
li.gap{color:#991b1b}
.chk{width:14px;flex-shrink:0}
.src{font-size:8pt;color:#666}
.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8pt;color:#6b7280;text-align:center;line-height:1.5}
@media print{.wrap{padding:0}}
</style>
</head>
<body><div class="wrap">

<div class="hdr">
  <div>
    <h1>Appeal Packet</h1>
    <div class="sub">Claim ${esc(claim.claim_id)} &#183; ${esc(claim.intel.payer_name)}${orgLabel}</div>
  </div>
  <div class="right">
    Generated: ${esc(new Date(packet.generated_at).toLocaleString('en-US'))}<br>
    Readiness: ${esc(packet.readiness_tier)} (${packet.readiness_score}%)
  </div>
</div>

<span class="badge ${statusClass}">${statusLabel}</span>
${blockingHtml}

<section>
  <h2>Claim Summary</h2>
  <table><tbody>
    ${row2('Claim ID', claim.claim_id, 'Member ID', claim.member_id, true)}
    ${row2('Payer', claim.intel.payer_name, 'Provider NPI', claim.provider_npi, true)}
    ${row2('Provider', claim.provider_name, 'Facility', claim.facility_name)}
    ${row2('Service Dates', claim.service_date_from.slice(0, 10) + ' \u2192 ' + claim.service_date_to.slice(0, 10), 'Claim Type', claim.claim_type, true)}
    ${row2('Total Billed', formatCents(claim.total_billed), 'Aging', claim.intel.aging_days + 'd (' + claim.intel.aging_bucket + ')', true)}
    ${row2('At Risk', formatCents(claim.intel.amount_at_risk_cents), 'Reimbursement State', claim.intel.reimbursement_state, true)}
  </tbody></table>
</section>

${denialHtml}

<section>
  <h2>Evidence Checklist</h2>
  <ul class="ev">
${evidenceItems}
  </ul>
</section>

<section>
  <h2>Attached Documents (${packet.attached_documents.length})</h2>
  <table>
    <thead><tr><td class="lbl">Type</td><td class="lbl">Filename</td><td class="lbl">Uploaded</td></tr></thead>
    <tbody>${docItems}</tbody>
  </table>
</section>

${timelineHtml}

<div class="footer">
  DualPay &#8212; ${esc(new Date(packet.generated_at).toLocaleString('en-US'))}${meta?.orgName ? ` &#8212; ${esc(meta.orgName)}` : ''}<br>
  <strong>Note:</strong> &#8220;Mark Submitted&#8221; does not transmit this appeal. Save this page as a PDF, then fax or upload to the payer portal.
</div>

</div></body></html>`;
}

/**
 * Opens a new browser tab containing the given HTML and triggers the print
 * dialog so the user can save the packet as a PDF.
 *
 * For async click handlers that do await work before calling this, open the
 * window synchronously first (before any awaits) to avoid popup blockers:
 *
 *   const win = window.open('', '_blank');
 *   await someAsyncWork();
 *   printAppealPdf(html, win);
 */
export function printAppealPdf(html: string, preOpenedWindow?: Window | null): void {
  const win = preOpenedWindow ?? window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Small delay allows the browser to finish rendering before the print dialog.
  setTimeout(() => { try { win.print(); } catch (_) { /* noop — some browsers block programmatic print */ } }, 400);
}
