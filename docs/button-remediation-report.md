# Button Remediation Report — Phase 4A

**Date:** 2026-06-29  
**Sprint:** Phase 4A — Friendly Pilot Readiness  
**Status:** COMPLETE

---

## Problem

Three buttons in `DenialDetail.tsx` and one button in `AppealPacket.tsx` had no `onClick` handlers — clicking them did nothing. These appeared on the primary operational screens that would be used in any customer demo.

---

## Buttons Remediated

### 1. Attach Evidence (`DenialDetail.tsx`)

| | Before | After |
|---|---|---|
| Handler | None | Opens hidden `<input type="file">` → `uploadEvidenceDocument()` → `appendOpsEvent(document_uploaded)` |
| Loading state | None | Label changes to "Uploading…", button disabled |
| Success | Nothing | Toast: "Evidence attached" |
| Failure | Nothing | Toast: "Upload failed" with error variant |
| Audit event | None | `document_uploaded` logged to `ops_events` with filename and document_id |
| File types accepted | N/A | `.pdf, .png, .jpg, .jpeg, .tiff, .csv, .xlsx` |

### 2. Mark Resolved (`DenialDetail.tsx`)

| | Before | After |
|---|---|---|
| Handler | None | `updateAssignment(claimId, orgId, { status: 'resolved' })` + `appendOpsEvent(workflow_transition)` |
| Loading state | None | Icon changes to spinner, label to "Resolving…", button disabled |
| Success | Nothing | Toast: "Claim resolved"; React Query cache invalidated |
| Failure | Nothing | Toast: "Could not mark resolved" with error variant |
| Audit event | None | `workflow_transition` with `to_status: 'resolved'` logged to `ops_events` |

### 3. Escalate (`DenialDetail.tsx`)

| | Before | After |
|---|---|---|
| Handler | None | `appendOpsEvent(escalation_raised)` with claim_id, payer, severity in payload |
| Loading state | None | Icon changes to spinner, label to "Escalating…", button disabled |
| Success | Nothing | Toast: "Escalation logged"; React Query cache invalidated |
| Failure | Nothing | Toast: "Could not log escalation" with error variant |
| Audit event | None | `escalation_raised` logged to `ops_events` |

### 4. Submit Appeal (`AppealPacket.tsx`)

| | Before | After |
|---|---|---|
| Enabled condition | `verdict === 'COMPLETE'` only | Same — button still requires complete checklist |
| Handler | None | Builds text appeal packet → `URL.createObjectURL()` → triggers `.txt` download → `appendOpsEvent(appeal_submitted)` |
| Loading state | None | Label changes to "Submitting…", button disabled |
| Success | Nothing | File downloads automatically; Toast: "Appeal submitted"; React Query cache invalidated |
| Failure | Nothing | Toast: "Could not submit appeal" with error variant |
| Audit event | None | `appeal_submitted` logged to `ops_events` with payer, checklist score |
| Download filename | N/A | `appeal-packet-{claim_id}-{YYYY-MM-DD}.txt` |

---

## Supporting Changes

### `ActionBtn` component (`DenialDetail.tsx`)

Added `onClick?: () => void` and `disabled?: boolean` props. Disabled state renders with `opacity-50 cursor-not-allowed`. All three buttons share one optimistic `working` state string — only one operation can run at a time.

### `useOrg()` added to `DenialDetail.tsx`

`org_id` is now available in the component for all three event-logging calls.

### `appendOpsEvent` org_id bug fixed (`ops-events.ts`)

The public `appendOpsEvent` function previously did not write `org_id` to the DB row. This meant events from DenialDetail, WorkloadManagement, and other UI surfaces were not org-scoped, making them invisible in AuditTrace's org-filtered view. Fixed in this sprint: `org_id` is now part of the `OpsEvent` interface and is inserted into every row.

### `appeal_submitted`, `claim_resolved`, `evidence_attached` added to `OpsEventKind`

These kinds are now typed in the `OpsEventKind` union and included in the AuditTrace event-kind filter dropdown.
