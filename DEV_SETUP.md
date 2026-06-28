# Phase 2.5 — Development Setup Guide

## Quick Start: Browser UI Path with RLS

After Phase 2 persistence is live, the browser UI requires an authenticated user with org membership to bypass RLS policies.

### Automatic Setup (Recommended)

In your browser console (after the app loads):

```javascript
import { ensureDevUser } from '@/lib/dev-auth-helper';

// Create a dev user with analyst role
const result = await ensureDevUser('dev@example.com', 'devpassword123', 'analyst');
console.log('✅ Dev user created:', result);
// Output: { user_id: '...', org_id: '...', email: 'dev@example.com', role: 'analyst' }
```

Then sign in via the Supabase Auth UI with that email/password.

### What Happens Automatically

1. ✅ **User created** in Supabase Auth (idempotent — safe to call multiple times)
2. ✅ **Demo Organization created** (if it doesn't exist)
3. ✅ **User added to Demo Organization** with specified role (default: `analyst`)
4. ✅ **Demo data seeded** with explicit `org_id` matching the Demo Organization
5. ✅ **RLS policies now allow access** — authenticated user is org member

### Manual Verification

After signing in with the dev user:

1. Open **SQL Editor** in Supabase dashboard
2. Run this query to verify org membership:

```sql
SELECT 
  (SELECT COUNT(*) FROM public.organization_members 
   WHERE user_id = auth.uid()) as org_count,
  (SELECT COUNT(*) FROM public.claims 
   WHERE org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())) as accessible_claims;
```

Expected: `org_count: 1` and `accessible_claims: 28` (Clarity dataset)

---

## Troubleshooting

### Error: "permission denied for relation claims"

**Cause:** User is authenticated but not an org member.

**Fix:**
```javascript
import { ensureDevUser } from '@/lib/dev-auth-helper';
await ensureDevUser('dev@example.com', 'devpassword123', 'analyst');
```

Then refresh the page.

### Error: "auth.uid() is NULL"

**Cause:** User is not signed in.

**Fix:** Sign in via the Supabase Auth UI or call `supabase.auth.signInWithPassword()` manually:

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'dev@example.com',
  password: 'devpassword123',
});
if (!error) window.location.reload();
```

### No demo data visible

**Cause:** Demo mode is disabled (`VITE_DEMO_MODE` not set).

**Fix:** In `.env`:

```
VITE_DEMO_MODE=true
```

Then restart the dev server:

```bash
npm run dev
```

---

## Role Hierarchy

The dev user can be created with any of these roles:

| Role | Permissions |
|------|-----------|
| `viewer` | Read-only — no write access |
| `analyst` | Read + write claims/runs/traces, assign work |
| `manager` | Analyst + delete, escalate, run exports |
| `admin` | Manager + org settings, security console |
| `owner` | Admin + delete organization |

**Example:** Create a manager:

```javascript
import { ensureDevUser } from '@/lib/dev-auth-helper';
await ensureDevUser('manager@example.com', 'managerpass', 'manager');
```

---

## Phase 2 UI Path: What's Now Wired

### Before (Node/Direct DB):
```
engine → persistence layer → Supabase → ✅ WORKS
```

### After (Browser UI):
```
browser user → auth check → org membership check → RLS policy → Supabase → ✅ WORKS
     ↓              ↓                ↓                 ↓
seedIfEmpty()   ensureDevUser()  org_id on          is_org_member()
creates Demo      adds user to   seeded data        + has_org_role()
Org + data        Demo Org       (claims, runs,     policies enforce
                                 traces, etc.)      access
```

### Execution Path in Browser:

1. **App loads** → calls `seedIfEmpty()`
2. **seedIfEmpty()** → creates Demo Organization + seeds claims with explicit `org_id`
3. **User not signed in** → RLS denies all reads (org_id present but auth.uid() is NULL)
4. **User signs in** → `ensureDevUser()` adds user to Demo Organization
5. **RLS policies now pass** → `is_org_member(org_id, auth.uid())` returns TRUE
6. **UI loads data** → loadClaims(), loadAccumulators() succeed
7. **User runs adjudication** → executeAdjudicationWithReplay() writes to DB
8. **Write succeeds** → has_org_role() check passes (user is analyst)
9. **Persistence recorded** → replay_records, replay_ledger_events, idempotency_keys

---

## Phase 2 Verification Checklist

- [ ] App loads without errors
- [ ] Demo Organization exists in `organizations` table
- [ ] Demo data seeded with `org_id` set
- [ ] Dev user created with `ensureDevUser()`
- [ ] Signed-in user appears in `organization_members`
- [ ] Claims visible on /platform or /workbench page
- [ ] Adjudication executes and writes to DB
- [ ] replay_records row count increases
- [ ] replay_ledger_events row count increases
- [ ] Duplicate fingerprint does not create new replay_record
- [ ] Idempotency key persists and blocks duplicates

---

## Advanced: Create Multiple Test Users

```javascript
import { ensureDevUser } from '@/lib/dev-auth-helper';

// Analyst user
await ensureDevUser('analyst@example.com', 'analystpass', 'analyst');

// Manager user  
await ensureDevUser('manager@example.com', 'managerpass', 'manager');

// Admin user
await ensureDevUser('admin@example.com', 'adminpass', 'admin');

console.log('✅ All test users created');
```

Then sign in with each to verify role-based access works.

---

## Production (No Demo Mode)

In production, the `ensureDevUser()` helper is not needed. Auth is handled by:

1. Supabase Auth signup/login (email, SSO, MFA, etc.)
2. `handle_new_user_org()` trigger — automatically creates an organization for new users
3. Admin adds users to existing orgs via organization_members table
4. RLS policies enforce org-scoped access

To disable demo mode in production:

```
VITE_DEMO_MODE=false  # or omit the env var
```

Then `seedIfEmpty()` returns `{ seeded: false }` and does not seed demo data.

---

## Files Modified

- `src/data/repository.ts` — Updated `seedIfEmpty()`, added `org_id` parameter to save functions
- `src/lib/dev-auth-helper.ts` — New helper for dev user creation
- `DEV_SETUP.md` — This file

No changes to:
- RLS policies (unchanged)
- Adjudication math (unchanged)
- Replay/fingerprint logic (unchanged)
- Persistence schema (unchanged)
