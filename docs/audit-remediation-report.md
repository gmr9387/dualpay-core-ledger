# Audit Remediation Report — Phase 4A

**Date:** 2026-06-29  
**Sprint:** Phase 4A — Friendly Pilot Readiness  
**Status:** COMPLETE

---

## Problem

`/audit` (AuditTrace.tsx) previously read demo data from `useClarityData()`. It pulled `claim.intel.timeline` — a synthetic event array embedded in the claim's JSON payload — and displayed those events as if they were real audit entries. This produced:

- **Fabricated actor names** (e.g., synthetic personnel)
- **Timestamps unrelated to actual system activity**
- **No event-type filtering**
- **No date filtering**
- **No export capability**

---

## Solution

`AuditTrace.tsx` has been fully rewritten to query **live `ops_events` records** scoped to the authenticated organization.

---

## Technical Changes

### `src/lib/ops-events.ts`

**Added:** `getOpsEventsByOrg(orgId, filter)` function
- Queries `ops_events` table filtered by `org_id`
- Supports `since` (ISO timestamp), `until` (ISO timestamp), `kinds` (string[]) filters
- Configurable result limit (default: 500)
- Returns `OpsEvent[]` in descending `occurred_at` order

**Fixed:** `appendOpsEvent()` now includes `org_id` in the inserted row
- Previous: `org_id` was omitted from the insert — events had no org association
- After: `org_id` is part of `OpsEvent` interface and written to DB on every event

**Extended:** `OpsEventKind` union now includes `appeal_submitted`, `claim_resolved`, `evidence_attached`

### `src/pages/AuditTrace.tsx`

**Fully rewritten.** New implementation:

| Feature | Before | After |
|---|---|---|
| Data source | `useClarityData()` → `claim.intel.timeline` (demo) | `getOpsEventsByOrg(orgId)` → live DB |
| Org scoping | None | Strict `org_id` filter |
| Date range filter | None | `From` / `To` date pickers |
| Event kind filter | None | Dropdown with 13 event types |
| CSV export | None | Downloads `audit-export-YYYY-MM-DD.csv` |
| Empty state | Shows demo events always | "No audit events found" with filter guidance |
| Actor display | Synthetic names | Real `actor_name` → `actor_email` → `actor` fallback chain |
| Claim links | Always linked (even null claim_id) | Links only when `claim_id` is present; shows `—` otherwise |

### `src/hooks/use-ops-events.ts`

`useOpsEvents().append` now auto-injects `org_id` from `useOrg()`. All callers (WorkloadManagement, etc.) no longer need to pass org_id manually when using the hook's `append` method.

---

## Audit Event Coverage

Events logged via `appendOpsEvent()` from the following surfaces now appear in AuditTrace:

| Surface | Event Kind |
|---|---|
| DenialDetail — Mark Resolved | `workflow_transition` |
| DenialDetail — Escalate | `escalation_raised` |
| DenialDetail — Attach Evidence | `document_uploaded` |
| AppealPacket — Submit Appeal | `appeal_submitted` |
| WorkloadManagement — Rebalance | `assignment_changed` |
| WorkloadManagement — Auto-assign | `assignment_changed` |
| ClaimDrawer — Assign | `assignment_changed` |
| WriteOff | `claim_written_off` |
| AuditExport | `audit_export_requested` |

---

## Filtering and Export

**Date filter:** ISO date pickers for `From` and `To`. Default window: last 30 days.  
**Event kind filter:** Dropdown menu with 13 most operationally significant event types. Selects all types when blank.  
**CSV export:** Button disabled when result set is empty. Exports all columns: `occurred_at`, `kind`, `summary`, `actor`, `actor_email`, `claim_id`, `org_id`.
