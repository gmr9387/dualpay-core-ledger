# DualPay — Access Control Policy

**Document owner:** Security & Compliance
**Audience:** Auditors (SOC 2, HIPAA), customer security reviewers, internal engineering & operations
**Status:** Internal working draft — reflects current implementation as of this revision
**Companions:** [`SECURITY.md`](./SECURITY.md), [`HIPAA_OVERVIEW.md`](./HIPAA_OVERVIEW.md), [`DATA_CLASSIFICATION.md`](./DATA_CLASSIFICATION.md), [`RISK_REGISTER.md`](./RISK_REGISTER.md)

Every control below is tagged **Implemented**, **Partially Implemented**, or **Planned**. Nothing is claimed that cannot be traced to a table, function, migration, edge function, or code file in the repo.

---

## 1. Purpose

Define how identities are provisioned, roles are assigned, access is enforced at the row level, and revocation is executed for the DualPay platform — a multi-tenant SaaS that processes PHI under HIPAA §160.103.

This policy operationalises:

- HIPAA §164.308(a)(3) Workforce Security and §164.308(a)(4) Information Access Management.
- HIPAA §164.312(a) Access Control, (b) Audit Controls, (d) Person or Entity Authentication.
- SOC 2 Trust Services Criteria CC6.1–CC6.3 (Logical & Physical Access), CC6.6 (Restricted Access), CC7.2 (Monitoring).

## 2. Scope

Applies to every identity that touches the DualPay data plane:

- End-user accounts in Lovable Cloud Auth (Supabase Auth).
- Membership rows in `public.organization_members`.
- Server-side identities (`service_role`) used by the three edge functions: `invite-member`, `scheduler-dispatcher`, `worker-dispatcher`.
- All 36 tables and both storage buckets (`evidence-documents`, `appeal-packets`).
- All routes exposed under `src/pages/**` and the guard components `RequireAuth` / `RequireRole`.

Out of scope: platform-operator access to the underlying managed infrastructure (governed by the hosting provider's own SOC 2 report).

---

## 3. User Types

The role ladder is stored as free-form text in `public.organization_members.role`. RLS policies allow-list role sets explicitly via `has_org_role(org_id, user_id, ARRAY[...])`.

| Role | Status | Typical persona | Capabilities |
|---|---|---|---|
| **Owner** | Implemented | Tenant founder / signer of BAA | Full read/write across the org; can add/remove members and assign any role including `owner`; can delete org-scoped data; only role provisioned by `handle_new_user_org()` on brand-new signup. |
| **Admin** | Implemented | Security/compliance lead | Same data-plane rights as Owner; can perform destructive operations (`DELETE`) on operational tables; can access `AdminAudit`, `AdminSecurity`, `AdminConsole`. |
| **Manager** | Implemented | RCM / billing manager | Read + write across operational tables; can generate appeal packets and initiate audit exports; can `DELETE` on operational tables per RLS template. |
| **Analyst** | Implemented | Day-to-day billing analyst | Read + `INSERT` / `UPDATE` on operational tables; **cannot** `DELETE`; cannot access admin routes. |
| **Viewer** | Planned | Read-only auditor, external reviewer | Read-only across operational tables; no writes; not currently represented in the role ladder — will require a new RLS branch and a `has_org_role(..., ARRAY['viewer', ...])` addition on every SELECT policy. |
| **Service Accounts** | Implemented | Edge functions, background workers | Not human accounts. Use the `service_role` JWT provisioned by the platform. Execute SECURITY DEFINER helpers (`claim_next_queue_job`, `recover_stalled_queue_jobs`). No end-user login path. |

Notes:

- The `Viewer` role is documented as **Planned** because no RLS policy currently references it; adding a viewer today would grant it analyst-equivalent writes unless policies are extended first.
- There is no cross-tenant "super-admin" human role. Platform operators reach data only via the managed infra plane, which is governed by the hosting provider's controls.

---

## 4. Least Privilege Model

**Implemented**

- Every operational table has four RLS policies (`_select`, `_insert`, `_update`, `_delete`) — see `src/pages/AdminSecurity.tsx` for the canonical inventory.
- SELECT is gated by `is_org_member(org_id, auth.uid())` — membership is sufficient to read; role is not required.
- INSERT/UPDATE is gated by `has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])`.
- DELETE is gated by `has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner'])`.
- `anon` is not granted on any operational table. `authenticated` is granted only the operations the policies allow.
- `service_role` is granted broadly on tables it must touch (workers/edge functions) and nothing else.
- Storage: both buckets are private; object keys must be prefixed `org_id/…`; root-level uploads are explicitly rejected (migration `20260710182913_af0f38ed-e0d7-4219-9dbe-4569d2d806cb.sql`).

**Partially Implemented**

- `EXECUTE` on `claim_next_queue_job` and `recover_stalled_queue_jobs` is currently broader than `service_role` only. Narrowing is on the remediation backlog (tracked in `RISK_REGISTER.md`).

**Planned**

- Viewer role with SELECT-only policies.
- Automated RLS regression test: for every table, assert a second-tenant JWT sees zero rows.
- Migration linter in CI enforcing GRANT + POLICY presence on every new `public` table.

---

## 5. Access Provisioning

### 5.1 New User Creation — **Implemented**

- All authentication flows through Lovable Cloud Auth (Supabase Auth). Password-based sign-in is exposed at `/login` (`src/pages/Login.tsx`).
- **Access is invite-only** — the Login screen states this explicitly; there is no public self-signup surface linked from the marketing route.
- Two signup paths exist server-side, mediated by the `handle_new_user_org()` trigger on `auth.users`:
  1. **Brand-new signup (no invite metadata):** the trigger creates a fresh `public.organizations` row (`name = 'My Organization'`) and inserts the user into `organization_members` with role `owner`. This is the only path that mints an Owner.
  2. **Invited signup:** if `raw_user_meta_data.invited_org_id` refers to an existing org, the user is added to that org with the role specified in `invited_role` (default `analyst`). No new org is created.
- Invitations are dispatched by the `invite-member` edge function, which runs under `service_role`.

### 5.2 Organization Membership — **Implemented**

- Membership is the row `(org_id, user_id, role)` in `public.organization_members` (UNIQUE on `(org_id, user_id, role)` per the user-roles pattern).
- RLS on `organization_members` allows:
  - **First-member bootstrap self-insert** (owner-provisioning on brand-new signup) — migration `20260710182913…`.
  - Reads for existing members of the same org.
  - Writes (add/remove/role change) only by `owner` or `admin` of the same org.
- The client-side resolver `useOrg()` and the non-React helper `getCurrentOrgId()` (`src/lib/current-org.ts`) both fall back to the SECURITY DEFINER RPC `current_org_id()` for authoritative resolution.

### 5.3 Role Assignment — **Partially Implemented**

- Assignable roles today: `owner`, `admin`, `manager`, `analyst` (matches the RLS allow-lists).
- Role changes are performed by an `owner` or `admin` and produce an `ops_events` entry (`kind = 'assignment_changed'` / equivalent) — see `src/lib/ops-events.ts`.
- **Partially Implemented** because: (a) there is no built-in UI enforcement preventing an admin from self-demoting the last owner (mitigated by leaving Owner-only surfaces to the RLS layer, but not defensively coded); (b) `viewer` is not yet an accepted role value.

**Planned**

- UI-level guardrails: prevent removing the last owner; require confirmation for privilege escalation.
- Approval workflow for `admin` and `owner` grants (dual-control).
- Time-bounded (JIT) role grants with automatic expiry.

---

## 6. Access Modification — **Partially Implemented**

- Any change to a user's role is a write on `organization_members`, gated by RLS to `owner`/`admin`.
- The `has_org_role` helper is `STABLE SECURITY DEFINER` and pinned to `search_path = public`, so role changes take effect on the next statement without a session refresh.
- Every membership change should emit an `ops_events` record with `kind='assignment_changed'` referencing the target user and the previous/new role in `payload`.

**Partially Implemented** because the emission of `ops_events` on role change is by convention in the calling code, not an enforced database trigger.

**Planned**

- Database trigger on `organization_members` INSERT/UPDATE/DELETE that writes an immutable audit row (independent of application code).
- Notification to the affected user on role change.

---

## 7. Access Revocation

### 7.1 Employee Departure — **Partially Implemented**

Runbook:

1. `owner` or `admin` deletes the row from `organization_members` (RLS-gated).
2. Platform auth session is invalidated on next token refresh; long-lived tokens must be revoked at the platform level (Lovable Cloud Auth).
3. An `ops_events` entry is written (`kind='assignment_changed'`, `payload = { action: 'removed', role: <prev> }`).
4. Any open `claim_assignments` owned by the user are standardised to `NULL` (unassigned) — see `src/test/assignments-unassign.test.ts` for the invariant.
5. Storage: user cannot mint new signed URLs after membership removal; existing signed URLs remain valid until their TTL — hence signed URL lifetimes must be kept short (see `SECURITY.md` §9).

**Partially Implemented** because step 5 (short signed-URL TTL, active session revocation) relies on platform defaults; there is no enforced revocation-time SLA yet.

### 7.2 Contractor Departure — **Partially Implemented**

Same runbook as §7.1. Contractors should be provisioned into a dedicated role (`analyst` or `viewer`-when-available), never `admin` or `owner`.

**Planned**

- Contractor accounts flagged with an expiry timestamp; scheduled job removes membership at expiry.
- Just-in-time contractor access via time-boxed invitations.

### 7.3 Organization Removal — **Partially Implemented**

- Deleting an `organizations` row cascades via FKs to `organization_members`.
- Operational tables carry `org_id NOT NULL` and are scoped by RLS; removing the org effectively removes access even before physical purge.
- Storage objects under the `org_id/…` prefix must be explicitly purged as part of tenant off-boarding.

**Planned**

- Tenant off-boarding runbook: export → confirm → delete → verify no orphan objects.
- Right-to-erasure workflow for BAA/customer requests.
- Documented retention window before hard-delete (default: 30 days soft-deleted, then purge).

---

## 8. Periodic Access Reviews — **Planned**

Not yet operationalised. Target state:

- **Quarterly** review of every `organization_members` row per tenant, signed off by the tenant Owner.
- **Monthly** review of internal admin/service-account grants.
- **On-demand** review triggered by role escalation to `admin` or `owner`.
- Review evidence stored as an `ops_events` entry (`kind='audit_export_completed'`) with a fingerprinted export of the reviewed state.

Interim compensating controls (**Implemented**):

- All membership changes are visible via `AdminSecurity` and `AdminAudit` routes.
- `ops_events` is append-only and can reconstruct the current member set at any point in time.

---

## 9. Service Account Controls

**Implemented**

- The only service identity is `service_role`, provisioned and rotated by the managed platform.
- `service_role` is used exclusively by the three edge functions (`invite-member`, `scheduler-dispatcher`, `worker-dispatcher`) and by background job execution.
- Client code never uses `service_role`; the frontend authenticates with the `anon`/`authenticated` publishable key plus a user JWT.
- SECURITY DEFINER helpers (`claim_next_queue_job`, `recover_stalled_queue_jobs`) are pinned to `search_path = public` to prevent schema-shadow attacks.

**Partially Implemented**

- `EXECUTE` grants on the two job-queue functions above are currently wider than strictly necessary. Remediation: revoke from `authenticated`/`anon`; grant to `service_role` only.

**Planned**

- Egress allow-list per edge function.
- Rotation policy documented and evidenced (rotation itself is provided by the managed platform).
- Per-function least-privilege review (which tables each edge function actually touches).

---

## 10. Privileged Access Controls

**Implemented**

- Admin surfaces (`AdminAudit`, `AdminSecurity`, `AdminConsole`, `PlatformHome`, `PlatformJobs`, `PlatformWorkers`, `PlatformFailures`) are wrapped in `RequireRole min="admin"` — client-side gate.
- Server-side enforcement lives in RLS + role checks on every query these pages run; a spoofed client bypass would still hit RLS.
- Destructive operations (`DELETE`) are restricted at the RLS layer to `manager+`.
- Owner is the only role that can be provisioned by the signup trigger; subsequent Owner grants require an existing Owner/Admin.

**Partially Implemented**

- No dual-control (four-eyes) requirement for `admin`/`owner` grants.
- No separation of duties between the identity that generates an audit export and the identity that reviews it.

**Planned**

- Break-glass procedure with time-boxed elevation, alerting, and mandatory post-use review.
- MFA enforcement mandate for `admin` and `owner` roles.
- Session length policy stricter for privileged roles.

---

## 11. Authentication Requirements

**Implemented**

- Email + password via Lovable Cloud Auth.
- Password reset flow (`ForgotPassword`, `ResetPassword`).
- Session token stored in browser `localStorage` under `sb-<project>-auth-token`; TLS 1.2+ everywhere.
- Invite-only access — no public signup exposed.

**Partially Implemented**

- MFA is available at the platform level but not mandated by DualPay policy.

**Planned**

- Enforce MFA for `admin` and `owner`.
- Enable Have-I-Been-Pwned password check on signup and reset (`password_hibp_enabled`).
- SAML SSO / OIDC federation for enterprise tenants.
- Per-tenant session-lifetime configuration.

---

## 12. Authorization Model

**Implemented — layered enforcement (defense in depth):**

1. **Route guards** (`RequireAuth`, `RequireRole`) — first line, client-side, prevents accidental navigation to unauthorised surfaces.
2. **RLS on every operational table** — authoritative line; a spoofed client cannot bypass it.
3. **Role check inside RLS** via `has_org_role` for writes and destructive operations.
4. **`org_id` scope** — every operational row carries `org_id NOT NULL`; the BEFORE-INSERT trigger `set_default_org_id()` fills it from `current_org_id()` when omitted.
5. **Storage RLS** — object key must be prefixed by the caller's `org_id`.

**Invariants:**

- No operational row exists with `NULL org_id`.
- No anonymous access on operational tables.
- No cross-tenant SELECT is possible even if application code omitted an `org_id` filter, because RLS enforces it.

---

## 13. RLS Enforcement Strategy

**Implemented**

- RLS enabled on all 36 tables in `public`.
- Helper functions (`SECURITY DEFINER`, `STABLE`, `search_path = public`):
  - `is_org_member(_org_id uuid, _user_id uuid) → boolean` — membership predicate.
  - `has_org_role(_org_id uuid, _user_id uuid, _roles text[]) → boolean` — role predicate.
  - `current_org_id() → uuid` — resolves the caller's default org (first-joined membership).
- Policy template used across the operational schema (mirrored in `AdminSecurity`):
  ```
  SELECT : is_org_member(org_id, auth.uid())
  INSERT : has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
  UPDATE : has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])
  DELETE : has_org_role(org_id, auth.uid(), ARRAY['manager','admin','owner'])
  ```
- Every `CREATE TABLE public.*` migration ships GRANT + `ENABLE ROW LEVEL SECURITY` + POLICY in the same file (project-wide invariant documented in `DATA_CLASSIFICATION.md` §5).
- `organization_members` uses a tailored policy set: bootstrap self-insert on brand-new signup; subsequent writes limited to `owner`/`admin`.
- Recursion is avoided by never referencing a table from its own policy — all lookups go through the SECURITY DEFINER helpers.

**Partially Implemented**

- `EXECUTE` narrowing on `claim_next_queue_job` and `recover_stalled_queue_jobs` — see §9.

**Planned**

- RLS regression test suite: for every table, assert (a) SELECT returns 0 rows for a foreign tenant, (b) INSERT with a foreign `org_id` is rejected, (c) DELETE by an `analyst` is rejected.
- CI migration linter that fails PRs adding a `public` table without matching GRANT + RLS + POLICY.
- Viewer role branch on every SELECT policy once §3 Viewer is promoted from Planned.

---

## 14. Access Logging & Auditability

**Implemented — three complementary surfaces (see `SECURITY.md` §8):**

- **`ops_events`** — append-only application event stream. Every write goes through `appendOpsEvent` (`src/lib/ops-events.ts`), which resolves the real actor identity from the Supabase session (`actor_user_id`, `actor_email`, `actor_name`). Coverage includes `assignment_changed`, `escalation_raised`, `document_uploaded`, `appeal_packet_generated`, `audit_export_requested`, `audit_export_completed`, `job_started/completed/failed/retried/dead_lettered`, `scheduler_started/completed`, `edi_received/parsed/validated/rejected/normalized/imported`, and more (see `OpsEventKind`).
- **`traces`** — snapshotted claim state and rule firings, SHA-256 fingerprinted, verified by `src/engine/trace-verifier.ts`.
- **`replay_ledger_events` / `replay_records`** — immutable replay attempts and results with integrity hashes.
- **Invariant:** no raw PHI in `ops_events.summary` — PHI is referenced only by FK (`claim_id`).
- UI surfaces: `AdminAudit`, `TransparencyCenter`, `AuditTrace`, `LineageClaim`, `ClaimDrawer`.

**Partially Implemented**

- Membership-change auditing is emitted by application code, not by a database trigger — an app-side bug could suppress the event.
- Authentication events (login, MFA challenge, password reset) live in the platform's Auth log rather than in `ops_events`.

**Planned**

- Database triggers on `organization_members` INSERT/UPDATE/DELETE that write directly to `ops_events`.
- SIEM forwarding (Datadog / Splunk / Elastic) for cross-source correlation.
- Alerting on high-risk sequences (mass export, mass delete, cross-role escalation, off-hours admin logins).
- 6-year retention enforced by scheduled purge (currently retained indefinitely).

---

## 15. Policy Exceptions

**Implemented process**

- Exceptions to this policy require written approval by the Security & Compliance owner and (for anything touching PHI or `admin`/`owner` grants) the CTO.
- Every approved exception is recorded as an `ops_events` entry (`kind='audit_export_requested'` with `payload.exception = true` until a dedicated kind is added) and cross-referenced from `docs/RISK_REGISTER.md`.
- Exceptions are time-bounded (default: 90 days) and must be re-approved to renew.
- Exceptions that materially widen access must be disclosed to affected tenants under the BAA.

**Planned**

- Dedicated `policy_exception` event kind and a first-class `policy_exceptions` table with owner, reason, expiry, and review evidence.
- Quarterly review of the open exceptions list.

---

## Appendix A — Role ↔ Capability Matrix (current state)

| Capability | Owner | Admin | Manager | Analyst | Viewer *(Planned)* | service_role |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Read operational tables (same org) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| INSERT/UPDATE operational rows | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| DELETE operational rows | ✓ | ✓ | ✓ | — | — | ✓ |
| Add/remove members, change roles | ✓ | ✓ | — | — | — | (via `invite-member`) |
| Access admin surfaces (`AdminAudit`, `AdminSecurity`, `AdminConsole`, `Platform*`) | ✓ | ✓ | — | — | — | — |
| Generate appeal packets, run audit exports | ✓ | ✓ | ✓ | — | — | — |
| Execute background jobs (`claim_next_queue_job`, `recover_stalled_queue_jobs`) | — | — | — | — | — | ✓ |
| Read `evidence-documents` / `appeal-packets` (own org prefix) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cross-tenant access | — | — | — | — | — | — |

## Appendix B — Traceability Index

| Control | Evidence |
|---|---|
| Role ladder | `public.organization_members.role`; `has_org_role` allow-lists |
| SELECT policy template | `src/pages/AdminSecurity.tsx` (mirrors migrations) |
| Bootstrap self-insert | migration `20260710182913_af0f38ed-e0d7-4219-9dbe-4569d2d806cb.sql` |
| Signup trigger | `public.handle_new_user_org()` |
| Default-org resolver | `public.current_org_id()`, `src/lib/current-org.ts` |
| Membership predicate | `public.is_org_member(_org_id, _user_id)` |
| Role predicate | `public.has_org_role(_org_id, _user_id, _roles)` |
| Storage isolation | Buckets `evidence-documents`, `appeal-packets` + org-prefix policy |
| Audit stream | `public.ops_events`, `src/lib/ops-events.ts` |
| Trace integrity | `public.traces` + `src/engine/trace-verifier.ts` |
| Route guards | `src/components/auth/RequireAuth.tsx`, `RequireRole.tsx` |
| Invite path | `supabase/functions/invite-member/index.ts` |

---

*This policy is reviewed at least quarterly and on every change to `organization_members`, RLS helper functions, or the role ladder. Material changes are announced to tenant Owners under the BAA.*
