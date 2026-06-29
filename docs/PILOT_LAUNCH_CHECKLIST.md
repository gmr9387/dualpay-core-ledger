# DualPay Pilot Launch Checklist

**Target:** Friendly pilot — 8-provider Michigan clinic, BCBSM-heavy payer mix  
**Status gate:** All P0 items must be ✅ before first real claim is imported.

---

## 1. Infrastructure — Database & Auth

- [ ] **Apply all pending migrations** in the Supabase dashboard (SQL Editor → run each migration file in `supabase/migrations/` in order). Confirm no errors before proceeding.
- [ ] **Supabase Dashboard → Auth → Providers → Email → Minimum password length = 8.** Client-side enforcement is live; this setting is the server-side gate.
- [ ] **Rotate the Supabase anon key.** Generate a new key in Project Settings → API, update the environment variable (`VITE_SUPABASE_ANON_KEY`) in all deployment environments, and redeploy.

---

## 2. Security & RLS Verification

- [ ] **Verify RLS policies** are active on every operational table. Navigate to `/admin/security` in the deployed app and confirm every table shows a policy — no table should appear without one.
- [ ] **Spot-check cross-org isolation.** With two test org accounts, confirm that org A cannot read claims, cases, or ops_events belonging to org B.
- [ ] **Confirm SECURITY DEFINER functions** (`is_org_member`, `has_org_role`, `current_org_id`, `set_default_org_id`, `handle_new_user_org`, `touch_updated_at`) have `EXECUTE` revoked from `PUBLIC`/`anon`.

---

## 3. Pilot Organisation Setup

- [ ] **Create pilot org** in the Supabase `organizations` table (or via the admin console if available). Record the `org_id`.
- [ ] **Assign owner account.** Sign up the lead administrator account, confirm email, then insert a row in `organization_members` with `role = 'owner'` and the correct `org_id`.
- [ ] **Invite pilot users.** For each provider/analyst:
  1. User signs up at `/signup` with a compliant password (≥ 8 chars, ≥ 1 number or symbol).
  2. Admin confirms their email in the Supabase Auth console.
  3. Admin inserts `organization_members` row with the appropriate role (`analyst`, `manager`, or `admin`).
- [ ] **Enable MFA** for all admin and owner accounts via Supabase Dashboard → Auth → Multi-Factor Authentication.

---

## 4. Compliance & Legal

- [ ] **Execute BAA (Business Associate Agreement)** with the pilot clinic before any PHI is imported. Do not proceed without a signed BAA on file.
- [ ] **Confirm Supabase HIPAA BAA** is in place (required for PHI at rest in Supabase Postgres and Storage).

---

## 5. Payer Configuration

- [ ] **Configure BCBSM** as the primary payer. Verify payer ID, EDI receiver ISA qualifiers, and CARC/RARC mapping tables are loaded.
- [ ] **Import payer contracts.** Upload the clinic's fee schedules via the Recovery Factory or direct DB import. Confirm contract records appear in `/contracts`.

---

## 6. Data Import & Smoke Test

- [ ] **Import test claim file.** Use the Recovery Factory (`/import`) to import a representative set of test claims (at least 5, covering denial, partial payment, and clean-pay scenarios). Confirm all rows validate without import exceptions.
- [ ] **Run two-org smoke test:**
  1. With pilot org A, adjudicate a sample claim and verify the result appears in Claim Clarity.
  2. Log in as org B (a separate test org) and confirm the claim from org A is **not** visible.
  3. Verify ops_events are scoped to the correct org.
- [ ] **Verify denial intelligence** — at least one imported denial claim should produce a denial classification, recoverability score, and next-best-action recommendation.
- [ ] **Verify remittance import** — import a sample 835 EDI file via `/edi/import` and confirm it normalises to `CanonicalRemittance` entries visible in Remittance Intelligence.

---

## 7. Observability (Pre-Launch Minimum)

- [ ] **Confirm audit export works.** As an admin, navigate to `/admin/audit`, run a redacted export, and verify the CSV downloads without error.
- [ ] **Monitor Supabase logs** for any unexpected errors during the first 24 hours of pilot operation.

---

## 8. Known Manual Items (Post-Launch)

| Item | Owner | Notes |
|---|---|---|
| Supabase password minimum = 8 | Infra | Set in Auth → Providers → Email |
| Rotate anon key | Infra | After rotation, redeploy frontend |
| Apply pending migrations | Infra | Before first login |
| Evidence_documents cascade delete | Engineering | Storage objects not yet cascade-deleted when a row is deleted |
| EDI 837 promote step | Engineering | 837P/837I normalised output not yet auto-promoted to `claims` |
| Background workers / cron | Engineering | Pipelines currently run synchronously in browser session |

---

## Go / No-Go Gate

All items in sections 1–6 must be ✅ before the pilot clinic imports real PHI.  
Items in sections 7–8 are tracked but do not block go-live.
