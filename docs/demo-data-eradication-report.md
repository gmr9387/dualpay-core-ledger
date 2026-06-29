# Demo Data Eradication Report — Phase 4A

**Date:** 2026-06-29  
**Sprint:** Phase 4A — Friendly Pilot Readiness  
**Status:** COMPLETE

---

## Summary

`useClarityData()` was the central data provider for all operational surfaces. Prior to Phase 4A it called `loadClaims()` with no `org_id` filter, meaning every organization saw every claim in the database. All analytical pages, dashboards, and worklists derived their KPIs, queues, and metrics from this unscoped dataset.

Phase 4A replaces the un-scoped pattern with org-scoped queries. Pages now receive **real claims belonging to the authenticated organization**, or an explicit empty state with an "Import Claims" CTA.

---

## Changes by Screen

| Screen | Previous Source | New Source | Status |
|---|---|---|---|
| Command Center | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Executive Intelligence | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Denial Intelligence | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Denial Detail | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Team Operations | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Workload Management | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Appeal Packet | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| My Worklist | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Recovery Pipeline | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Recovery Forecast | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| SLA Management | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Evidence Vault | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Escalations | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Transparency Center | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Playbooks | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Revenue Leak | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Outcome Log | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Recovery Intelligence | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Payer Operations | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Today's Opportunities | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Executive Command | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Executive Pipeline | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Recovery Ops Dashboard | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |
| Claims Workbench | `useClarityData()` — all claims in DB | `useClarityData(orgId)` — org-scoped | ✅ REPLACED |

---

## Technical Changes

### `src/data/repository.ts` — `loadClaims()`
- **Before:** `supabase.from('claims').select('payload')` — no org filter
- **After:** `supabase.from('claims').select('payload').eq('org_id', orgId)` — strict org filter
- Returns `[]` immediately if `orgId` is undefined (prevents race condition during auth load)

### `src/hooks/use-clarity-data.ts` — `useClarityData()`
- **Before:** Called `seedIfEmpty()` (demo seeder) + `loadClaims()` unconditionally
- **After:** Calls `useOrg()` to resolve `currentOrg.org_id`; passes it to `loadClaims(orgId)`; adds `enabled: !!orgId` guard; includes `orgId` in query key to prevent cross-org cache contamination
- `seedIfEmpty` no longer called from this hook (demo seeder remains gated by `isDemoModeEnabled()` in repository.ts)

### `src/components/clarity/primitives.tsx` — `EmptyState`
- Added optional `action?: { label: string; to: string }` prop
- When provided, renders a primary CTA button linking to the specified route

### `src/pages/CommandCenter.tsx` and `src/pages/ExecutiveHome.tsx`
- Added explicit `claims?.length === 0` empty state check
- Shows: "Your organization has no imported claims yet." with "Import Claims" CTA linking to `/import`

---

## Demo Seed Behavior

`seedIfEmpty()` in `repository.ts` continues to exist and is **correctly gated**:
- Only runs when `isDemoModeEnabled()` returns `true`
- `isDemoModeEnabled()` is `true` only in `NODE_ENV === 'development'` OR `VITE_DEMO_MODE=true`
- Production organizations never trigger demo seeding
- **No additional changes required to `src/lib/demo-flag.ts`**

---

## React Query Cache Isolation

**Previous query key:** `['clarity-claims']` — shared across all orgs, cross-org cache contamination possible  
**New query key:** `['clarity-claims', orgId]` — per-org isolation, safe for multi-tenant sessions
