/**
 * Appeal packet PDF generator.
 * Client-side jsPDF — no server round-trip so it works offline
 * for the clinic and doesn't require any additional infra.
 */
import { jsPDF } from 'jspdf';
import type { Claim } from '@/types/claim';
import type { ClaimIntel } from '@/types/clarity';
import { CATEGORY_LABEL } from '@/engine/denial-intelligence';

interface PacketArgs {
  claim: Claim & { intel: ClaimIntel };
  checklist: Array<{ label: string; ok: boolean; detail?: string }>;
  verdict: string;
  strategy?: string;
  payerRequirements?: { payer_name: string; timely_filing_days: number; appeal_deadlines: { level_1_days: number; level_2_days: number } };
  orgName?: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildAppealPacketPdf(args: PacketArgs): jsPDF {
  const { claim, checklist, verdict, strategy, payerRequirements, orgName } = args;
  const intel = claim.intel;
  const primary = intel.denial_events[0];

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  const h1 = (t: string) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(t, margin, y); y += 22; };
  const h2 = (t: string) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, margin, y); y += 16; };
  const p  = (t: string, opts?: { mono?: boolean; muted?: boolean }) => {
    doc.setFont(opts?.mono ? 'courier' : 'helvetica', 'normal');
    doc.setFontSize(10);
    if (opts?.muted) doc.setTextColor(110);
    const lines = doc.splitTextToSize(t, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12;
    doc.setTextColor(0);
  };
  const kv = (k: string, v: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80);
    doc.text(k.toUpperCase(), margin, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
    doc.text(v, margin + 140, y);
    y += 14;
  };
  const hr = () => { doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 10; };
  const pageBreak = (needed = 60) => { if (y > doc.internal.pageSize.getHeight() - margin - needed) { doc.addPage(); y = margin; } };

  // Header
  h1('Formal Appeal Packet');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text(`${orgName ?? 'Provider Organization'} · Generated ${new Date().toLocaleString('en-US')}`, margin, y);
  y += 18; doc.setTextColor(0);
  hr();

  h2('Claim Identification');
  kv('Claim ID', claim.claim_id);
  kv('Payer', intel.payer_name);
  kv('Provider', claim.provider_name ?? '—');
  kv('Provider NPI', claim.provider_npi ?? '—');
  kv('Member ID', claim.member_id ?? '—');
  kv('Dates of Service', `${claim.service_date_from?.slice(0,10) ?? '—'} → ${claim.service_date_to?.slice(0,10) ?? '—'}`);
  kv('Total Billed', money(claim.total_billed));
  kv('Amount at Risk', money(intel.amount_at_risk_cents));
  y += 8; hr();

  if (primary) {
    h2('Denial Details');
    kv('CARC / RARC', `${primary.carc_code}${primary.rarc_code ? ' / ' + primary.rarc_code : ''}`);
    kv('Group Code', primary.group_code ?? '—');
    kv('Category', CATEGORY_LABEL[primary.category] ?? primary.category);
    kv('Amount', money(primary.amount_cents));
    kv('Occurred', primary.occurred_at?.slice(0, 10) ?? '—');
    y += 4;
    p(`Root cause: ${primary.root_cause}`);
    if (primary.payer_message) p(`Payer message: "${primary.payer_message}"`, { muted: true });
    y += 4; hr();
  }

  pageBreak(120);
  h2('Appeal Rationale');
  if (strategy) p(strategy); else p('No playbook rationale available for this denial category.', { muted: true });
  y += 4; hr();

  pageBreak(80);
  h2('Service Line Detail');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Line', margin, y);
  doc.text('CPT', margin + 40, y);
  doc.text('Dx', margin + 100, y);
  doc.text('Units', margin + 260, y);
  doc.text('Billed', margin + 320, y);
  y += 14;
  doc.setFont('courier', 'normal'); doc.setFontSize(9);
  for (const l of claim.lines) {
    pageBreak(30);
    doc.text(String(l.claim_line_number), margin, y);
    doc.text(`${l.procedure_code}${l.procedure_modifier ? '-' + l.procedure_modifier : ''}`, margin + 40, y);
    doc.text(l.diagnosis_codes.slice(0, 3).join(','), margin + 100, y);
    doc.text(String(l.units), margin + 260, y);
    doc.text(money(l.billed_amount), margin + 320, y);
    y += 12;
  }
  y += 4; hr();

  pageBreak(120);
  h2('Submission Checklist');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  for (const c of checklist) {
    pageBreak(24);
    doc.text(c.ok ? '[x]' : '[ ]', margin, y);
    doc.text(c.label, margin + 24, y);
    if (c.detail) {
      doc.setTextColor(110); doc.setFontSize(9);
      const lines = doc.splitTextToSize(c.detail, pageW - margin * 2 - 24);
      y += 12;
      doc.text(lines, margin + 24, y);
      y += lines.length * 11;
      doc.setTextColor(0); doc.setFontSize(10);
    } else {
      y += 14;
    }
  }
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Readiness verdict: ${verdict.replace(/_/g, ' ')}`, margin, y);
  y += 18; hr();

  if (payerRequirements) {
    pageBreak(80);
    h2(`Payer Requirements — ${payerRequirements.payer_name}`);
    kv('Timely filing', `${payerRequirements.timely_filing_days} days`);
    kv('Level 1 window', `${payerRequirements.appeal_deadlines.level_1_days} days`);
    kv('Level 2 window', `${payerRequirements.appeal_deadlines.level_2_days} days`);
  }

  // Footer note
  pageBreak(80);
  y = doc.internal.pageSize.getHeight() - margin - 40;
  doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 12;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(110);
  const disclaimer = 'Delivery of this packet to the payer is MANUAL. DualPay generates the packet and records submission for audit — it does NOT transmit the appeal to the payer. Submit via the payer portal, fax, or mail per the payer requirements above.';
  const lines = doc.splitTextToSize(disclaimer, pageW - margin * 2);
  doc.text(lines, margin, y);

  return doc;
}

export function downloadAppealPacketPdf(args: PacketArgs) {
  const doc = buildAppealPacketPdf(args);
  const filename = `appeal-${args.claim.claim_id}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
