# Roster Remediation Report — Phase 4A

**Date:** 2026-06-29  
**Sprint:** Phase 4A — Friendly Pilot Readiness  
**Status:** COMPLETE

---

## Problem

`ASSIGNEES` was a hardcoded string array in `src/lib/assignments.ts`:

```
'M. Alvarez (Appeals Lead)',
'J. Chen (Senior Biller)',
'R. Okafor (Auth Team)',
'P. Singh (Clinical Liaison)',
'D. Nakamura (COB)',
'K. Brooks (Coding QA)',
```

These fictional names appeared in:
- Team Operations roster panel
- Workload Management load distribution table
- Assignment dropdowns (DenialIntelligence)
- Auto-assign and rebalance logic

A real clinic would see fake employee names. No real staff could be assigned work.

---

## Solution

Created `useOrgMembers()` hook that fetches real organization members from the database and resolves their display names from `ops_events` actor history.

---

## Technical Changes

### `src/hooks/use-org-members.ts` — NEW FILE

**Interface:**
```typescript
interface OrgMember {
  user_id: string;
  role: string;
  display_name: string; // email, full name, or role+uid prefix
}
```

**Resolution strategy:**
1. Query `organization_members` for all members in the current org
2. Query `ops_events` for `actor_email` / `actor_name` grouped by `actor_user_id` — populated automatically when users log events
3. Combine: `display_name = actor_name ?? actor_email ?? "{Role} ({uid[:8]})"`

This approach requires no new DB tables or migrations. As users perform actions (assignments, notes, resolutions), their identity is captured in `ops_events` and becomes available to the roster.

### `src/pages/TeamOperations.tsx`

| Before | After |
|---|---|
| `import { ASSIGNEES }` | `import { useOrgMembers }` |
| Auto-assign: `ASSIGNEES[i % ASSIGNEES.length]` | Auto-assign: `roster[i % roster.length].display_name` |
| KPI: `ASSIGNEES.length` | KPI: `roster.length` |
| Roster panel: hardcoded names | Roster panel: live `roster` with `user_id`, `role`, `display_name` |

Auto-assign button is disabled when roster is empty (no members added to org yet).

### `src/pages/WorkloadManagement.tsx`

| Before | After |
|---|---|
| `import { ASSIGNEES }` | `import { useOrgMembers }` |
| Underutilized derivation: `ASSIGNEES.map(...)` | Underutilized derivation: `roster.map(r => r.display_name)` |
| `maxLoad` from ASSIGNEES | `maxLoad` from live roster names |
| Load distribution table: `ASSIGNEES.map(a => ...)` | Load distribution table: `displayNames.map(a => ...)` (live roster or team members from store) |
| Auto-assign: `ASSIGNEES[i % ASSIGNEES.length]` | Auto-assign: `roster[i % roster.length].display_name` |

### `src/pages/DenialIntelligence.tsx`

Assignment dropdown:
- **Before:** `{assignees.map(n => <option key={n} value={n}>{n}</option>)}`
- **After:** `{roster.map(m => <option key={m.user_id} value={m.display_name}>{m.display_name}</option>)}`

Uses `useOrgMembers()` directly instead of the now-removed `assignees` from `useAssignments()`.

### `src/hooks/use-assignments.ts`

Removed `ASSIGNEES` import and the `assignees` property from the return object. This was the only consumer-facing surface exposing the hardcoded list. The property is no longer exported.

### `src/lib/assignments.ts`

`ASSIGNEES` array is now marked `@deprecated` with a JSDoc comment explaining it is a Phase 2 artifact. The array remains exported only for `job-runner.ts` background queue assignment (server-side context where React hooks cannot be used). A migration note is included in the deprecation comment.

---

## Pilot Notes

For a new clinic onboarding with zero ops_events history, the roster will show members as `"{Role} ({uid[:8]})"` until users perform their first logged action (assignment, note, resolution, etc.). Display names automatically improve as activity accumulates.

For pilots where names are immediately needed, clinic admins can request a database migration to add a `user_profiles(user_id, display_name)` table — a recommended post-pilot enhancement.
