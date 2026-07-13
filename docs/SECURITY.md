# DualPay — Security Overview

**Document owner:** Security & Compliance
**Audience:** Prospective customers, auditors, partners, internal engineering
**Status:** Internal working draft — reflects current implementation as of this revision
**Companions:** [`HIPAA_OVERVIEW.md`](./HIPAA_OVERVIEW.md), [`RISK_REGISTER.md`](./RISK_REGISTER.md), [`DATA_CLASSIFICATION.md`](./DATA_CLASSIFICATION.md)

Each control below is marked **Implemented** (present in the code/config today) or **Planned** (committed on the roadmap but not yet in production). No control is claimed that cannot be traced to a file, migration, table, bucket, or documented process.

---

## 1. Executive Security Overview

DualPay is a multi-tenant SaaS platform for healthcare claim adjudication, denial recovery, and revenue-integrity operations. It processes Protected Health Information (PHI) under HIPAA §160.103, including X12 837/835 payloads, remittance detail, and clinical evidence attachments.

Security posture rests on five pillars, all **Implemented**:

1. **Tenant isolation by construction** — every PHI/Confidential table carries an `org_id`; all reads/writes pass through Row Level Security using `SECURITY DEFINER` helpers.
2. **Role-scoped write access** — an `analyst → manager → admin → owner` ladder is enforced in RLS policies via `has_org_role`.
3. **Deterministic, append-only audit** — three log surfaces (`ops_events`, `traces`, `replay_ledger_events`) with SHA-256 fingerprinted trace records.
4. **Private-by-default storage** — both storage buckets (`evidence-documents`, `appeal-packets`) are private; root-level uploads blocked by policy.
5. **Managed platform primitives** — TLS in transit, AES-256 at rest, and managed key rotation via the underlying Lovable Cloud (Supabase) backend.

Formal SOC 2 Type I attestation and HITRUST are **Planned** (see §14).

---

## 2. Security Contact Process

**Implemented**

- Primary channel: `security@dualpay.example` (replace with tenant-configured address at deployment).
- Response SLA target: acknowledgment within **1 business day**, triage within **3 business days**, remediation ETA within **10 business days**.
- Encrypted channel: PGP key **Planned**; until then, sensitive reports should reference a case ID and avoid inlining PHI.
- Internal routing: Security & Compliance owner → Engineering on-call → CTO for Sev-1.

**Planned**

- Dedicated `/.well-known/security.txt` at the marketing origin.
- PagerDuty (or equivalent) rotation for after-hours Sev-1 pages.

---

## 3. Responsible Disclosure Policy

**Implemented (policy text; program is Planned)**

We ask researchers to:

1. Report privately to the address in §2 before any public disclosure.
2. Provide reproduction steps, affected URL/route, and impact.
3. **Never** access, download, retain, or share real PHI. Use only synthetic tenants when possible.
4. Avoid degradation of service — no automated scans that generate load, no destructive tests, no social engineering of staff or customers.
5. Allow a 90-day remediation window before public write-ups.

In return, we commit to:

- Non-retaliation for good-faith research.
- Acknowledgment in a `SECURITY_HALL_OF_FAME.md` (Planned) if the researcher wishes.
- No legal action for testing that stays within scope and does not touch real PHI.

**Out of scope:** third-party services, denial-of-service, physical attacks, social engineering, findings that require a compromised endpoint the user already controls.

**Planned:** formal VDP hosted on a program platform, safe-harbor language reviewed by counsel, and (later) a paid bounty tier.

---

## 4. Authentication & Authorization

**Implemented**

- Identity provider: Lovable Cloud auth (Supabase Auth). Email/password sign-in (`src/pages/Login.tsx`) with session tokens in `localStorage` under the `sb-<project>-auth-token` key.
- Access is **invite-only**; the Login screen states this explicitly. Public self-signup is not exposed on `/`.
- Password reset flow implemented (`src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`).
- Server-side authorization gate: `RequireAuth` (route wrapper) plus `RequireRole` (role wrapper) — see `src/components/auth/RequireAuth.tsx`, `src/components/auth/RequireRole.tsx`, and every admin route (e.g. `AdminSecurity`, `AdminAudit`, `AdminConsole`).
- Role ladder: `owner > admin > manager > analyst` — persisted in `public.organization_members.role`, enforced in RLS via `public.has_org_role(_org_id, _user_id, _roles)`.
- Membership check helper: `public.is_org_member(_org_id, _user_id)` (SECURITY DEFINER, STABLE).
- Default-org resolver for inserts: `public.current_org_id()` (SECURITY DEFINER) plus BEFORE-INSERT trigger `set_default_org_id()`.
- Bootstrap safety: `handle_new_user_org()` provisions a fresh org on brand-new signup and only joins an existing org when an `invited_org_id` is present and valid.

**Planned**

- SAML SSO / OIDC federation for enterprise tenants.
- Multi-factor authentication enforcement (currently available at the platform level; org-level mandate is Planned).
- Have-I-Been-Pwned password check on signup and reset (`password_hibp_enabled`).
- Session-length policy per tenant.

---

## 5. Multi-Tenant Isolation Model

**Implemented**

- One shared Postgres schema (`public`) with **row-level tenancy** keyed by `org_id`.
- Tenant registry: `public.organizations` (`org_id`, name, timestamps).
- Membership table: `public.organization_members` (`org_id`, `user_id`, `role`) with self-insert allowed only for the first-member bootstrap (migration `20260710182913…`).
- Every PHI/Confidential table carries `org_id NOT NULL`.
- Every operational table has four RLS policies (`_select`, `_insert`, `_update`, `_delete`) referencing `is_org_member` and/or `has_org_role`.
- Storage isolation: `evidence-documents` and `appeal-packets` are private; keys are prefixed `org_id/…`; root-level uploads are explicitly rejected by storage policy.
- Client-side org context: `useOrg()` resolves the currently active org; non-React code paths use `getCurrentOrgId()` (`src/lib/current-org.ts`) which falls back to the `current_org_id()` RPC.

**Explicitly forbidden and enforced:**

- No cross-tenant joins in application code.
- No `NULL org_id` on operational rows (see `AdminSecurity` inventory).
- No anonymous access on operational tables.

**Planned**

- Per-tenant KMS-scoped column encryption for `member_id`.
- Optional single-tenant Postgres for regulated enterprise customers.

---

## 6. Row Level Security (RLS) Strategy

**Implemented**

- RLS is enabled on all 36 tables in `public`.
- Each `CREATE TABLE` migration is accompanied by explicit `GRANT`s to `authenticated` (and `service_role` where edge functions/admin code require it); `anon` is granted only where a policy authorizes anonymous reads (which currently is nowhere on operational tables).
- Policy template (mirrored in `src/pages/AdminSecurity.tsx`):
  - `SELECT` — `is_org_member(org_id, auth.uid())`
  - `INSERT` — `has_org_role(org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])`
  - `UPDATE` — same as INSERT
  - `DELETE` — `has_org_role(..., ARRAY['manager','admin','owner'])`
- Helper functions are `SECURITY DEFINER`, `STABLE`, and pinned to `search_path = public` to avoid schema-shadowing attacks.
- `service_role` is used exclusively for edge functions and background workers; `EXECUTE` on `claim_next_queue_job` and `recover_stalled_queue_jobs` is being narrowed to `service_role` (see §14 remediation).

**Planned**

- Automated RLS regression tests (spawn a second-tenant JWT, assert zero rows on every table).
- Linter check in CI that fails any migration that creates a table in `public` without matching GRANT + POLICY blocks.

---

## 7. Data Encryption

### 7.1 At Rest — **Implemented**

- Postgres data files and WAL: AES-256 at rest (managed by Lovable Cloud / Supabase infrastructure).
- Storage objects in `evidence-documents` and `appeal-packets`: encrypted at rest by the object store.
- Automatic daily backups (see §10) inherit the same at-rest encryption.
- Secrets (`SUPABASE_*`, `LOVABLE_API_KEY`, etc.) are stored in the managed secret store and never committed to source.

### 7.2 In Transit — **Implemented**

- All client ↔ backend traffic uses HTTPS/TLS 1.2+ (platform default).
- All Postgres connections use TLS; the client SDK enforces it.
- Storage signed URLs are HTTPS-only and single-use.

### 7.3 Application-Layer — **Planned**

- Column-level encryption of `member_id` on `claims`, `remittance_lines`, `member_accumulators`, and `edi_segments`.
- Envelope encryption of raw `edi_transactions.payload` (X12 837/835 envelopes).
- Per-tenant KMS keys with rotation.
- Field-level tokenization for exports to non-BAA analytics environments.

---

## 8. Audit Logging & Traceability

**Implemented — three complementary surfaces:**

1. **`ops_events`** (Confidential): structured application event stream. Append-only. Every write goes through `appendOpsEvent` (`src/lib/ops-events.ts`), which resolves the real actor identity from the Supabase session and records `actor_user_id`, `actor_email`, `actor_name`, `kind`, `claim_id`, and a `summary`. **Invariant: no raw PHI in `summary`** — PHI is referenced only by FK (`claim_id`).
2. **`traces`** (PHI): snapshotted claim state and rule firings for the calculation engine. Each trace is SHA-256 fingerprinted; integrity is verified by `src/engine/trace-verifier.ts`.
3. **`replay_ledger_events` / `replay_records`** (Confidential): immutable ledger of replay attempts and outcomes, with integrity hashes.

Coverage highlights (`OpsEventKind` in `src/lib/ops-events.ts`):

- Assignment changes, escalations, SLA acknowledgments
- Exception create/correct/ignore/import
- Document upload/update/link/remove
- Appeal packet generation, audit exports
- Contract upload/version/match, underpayment detection, dispute creation
- Job lifecycle (queued, started, completed, failed, retried, dead-lettered, stalled-recovered)
- Worker heartbeats, scheduler runs
- EDI lifecycle (received, parsed, validated, rejected, normalized, imported)
- Lineage created/linked/missing/repaired

**UI surfaces:** `AdminAudit`, `TransparencyCenter`, `LineageClaim`, `AuditTrace`, and the per-claim `ClaimDrawer` all read from these tables.

**Planned**

- 6-year audit retention policy enforced by scheduled purge job (currently retained indefinitely).
- Log-forwarding to an external SIEM (Datadog / Splunk / Elastic).
- Auth event ingestion into `ops_events` (currently in the platform Auth log only).
- Alerting on suspicious sequences (mass export, mass delete, cross-role escalation).

---

## 9. Evidence & Document Storage Security

**Implemented**

- Two buckets, both **private**: `evidence-documents` and `appeal-packets`.
- Object keys are prefixed with `org_id/…`; storage RLS restricts read/write to the owning org.
- Root-level uploads (missing `org_id/` prefix) are explicitly blocked by the storage policy shipped in migration `20260710182913_af0f38ed-e0d7-4219-9dbe-4569d2d806cb.sql`.
- Access is via short-lived signed URLs; direct object listing is not exposed to end users.
- Uploader UI: `src/components/evidence/EvidenceUploader.tsx`; metadata rows live in `evidence_documents` (PHI).
- Every upload/update/link/remove is journaled to `ops_events` (`document_uploaded`, `document_updated`, `document_linked`, `document_removed`).
- Appeal packets are generated via `src/lib/pdf-appeal.ts`, stored in `appeal-packets`, and logged with `appeal_packet_generated`.

**Planned**

- Antivirus / malware scanning on upload.
- Content-type allow-list enforced server-side.
- Per-object retention windows aligned with claim lifecycle.
- Signed-URL expiry telemetry (detect leaks).

---

## 10. Backup & Recovery Overview

**Implemented (via managed platform)**

- Daily automated Postgres backups with point-in-time recovery within the platform's retention window.
- Storage buckets are replicated by the object store; objects are individually versioned.
- Infrastructure-as-config: RLS policies, functions, triggers, GRANTs, and buckets are all defined in `supabase/migrations/*.sql` and reproducible into a fresh project.

**Planned**

- Documented RTO (target: **4 hours**) and RPO (target: **1 hour**) for a full-region restore drill.
- Quarterly restore rehearsal with signed evidence.
- Cross-region backup copy for disaster recovery.
- Tenant-scoped export/erasure workflow (BAA / right-to-erasure request handling beyond the platform default).

---

## 11. Incident Reporting Process

**Implemented (skeleton — see `docs/HIPAA_OVERVIEW.md` §Incident Response)**

1. **Detect** — signal from platform alerting, customer report, or internal review.
2. **Triage** — Security & Compliance owner classifies severity (Sev-1 confirmed PHI exposure; Sev-2 potential exposure or auth bypass; Sev-3 policy/config drift).
3. **Contain** — revoke tokens, disable affected accounts, freeze the tenant if needed, snapshot `ops_events` / `traces` for forensics.
4. **Eradicate & Recover** — deploy fix, verify with regression, re-enable access.
5. **Notify** — for confirmed PHI exposure: notify affected covered-entity customers per BAA; individual and HHS notification within **60 days** as required by HIPAA Breach Notification Rule.
6. **Post-mortem** — blameless review, remediation backlog into `RISK_REGISTER.md`.

**Planned**

- Formal on-call rotation and paging.
- Tabletop exercises quarterly.
- Pre-drafted breach-notification templates approved by counsel.
- Customer status page.

---

## 12. Secure Development Practices

**Implemented**

- TypeScript strict mode across the app; typed database client generated from schema (`src/integrations/supabase/types.ts`).
- Migrations reviewed and applied through the platform migration tool (single source of truth in `supabase/migrations/`).
- Every `CREATE TABLE public.*` migration must ship with matching GRANT + RLS + POLICY (documented in `docs/DATA_CLASSIFICATION.md` §5 and the project's build-time directives).
- Role-based route guards (`RequireAuth`, `RequireRole`) prevent client-only bypass of admin surfaces.
- Deterministic calculation core (see `mem://logic/calculation-engine`) with idempotency keys (`idempotency_keys` table) — prevents duplicate financial side-effects.
- Test suites for high-risk logic: calculation, state machine, replay ledger/store, idempotency persistence, assignments unassign, appeal-recovery cases (`src/test/*.test.ts`).
- Secrets are read from the managed secret store; `.env` in the repo contains only public/publishable identifiers.
- Public-schema `SECURITY DEFINER` helpers are pinned to `search_path = public`.

**Planned**

- CI pipeline enforcing: typecheck, lint, tests, RLS regression, dependency scan (`code--dependency_scan`), and a migration linter (GRANT + POLICY presence).
- SAST (Semgrep / CodeQL) on every PR.
- Secret scanning (gitleaks / trufflehog) on every PR.
- Load and chaos testing (k6 / artillery / Toxiproxy).
- Formal SDLC policy document and developer security training.
- Pre-merge PHI-in-log lint rule (forbid `console.*` around PHI-typed values).

---

## 13. Vendor & Third-Party Risk Management

**Implemented — inventory**

| Vendor | Purpose | Data touched | Basis |
|---|---|---|---|
| Lovable Cloud (Supabase-managed) | Postgres, Auth, Storage, Edge Functions | PHI, Confidential | Managed platform; BAA **Planned** (see §14) |
| Lovable AI Gateway | LLM inference for assistive features (opt-in) | No PHI sent by default | `LOVABLE_API_KEY` secret; prompts must be scrubbed |
| Browser / CDN edge | TLS termination, static asset delivery | Non-PHI static | Standard TLS |

No other subprocessors are wired today. The `edi-gateway` (`src/lib/edi-gateway.ts`) is a stub — no live clearinghouse egress. Third-party AI (OpenAI/Anthropic/etc.) is **not** connected unless explicitly enabled by the tenant via a user-provided secret.

**Planned**

- Formal Vendor Register with owner, data classes, BAA status, last review date.
- Annual subprocessor review; customer notification of changes.
- Contract clauses requiring incident notification within 24 hours.
- Egress allow-list at the edge-function layer.

---

## 14. Compliance Roadmap

### 14.1 HIPAA — **Implemented / Planned mix**

**Implemented**

- Technical Safeguards §164.312: access control (RLS + roles), audit controls (`ops_events`, `traces`, `replay_*`), integrity controls (SHA-256 trace fingerprints), transmission security (TLS everywhere).
- PHI inventory: `docs/HIPAA_OVERVIEW.md` and `docs/DATA_CLASSIFICATION.md`.
- Minimum-necessary access via role ladder and RLS.
- Data classification and export whitelist (`docs/DATA_CLASSIFICATION.md` §4).

**Planned**

- Executed BAA with the managed platform provider on file for tenant review.
- Written Administrative Safeguards (§164.308): workforce training log, sanction policy, access review cadence (quarterly).
- Physical Safeguards (§164.310): inherited from hosting provider; documented and mapped.
- Column-encryption of `member_id`; envelope-encryption of raw EDI payloads.
- 6-year audit retention job.
- Breach-notification runbook approved by counsel.

### 14.2 SOC 2 — **Planned**

Current state: no formal report.

Target sequence:

1. **Readiness assessment** — map existing controls to Trust Services Criteria (Security, Availability, Confidentiality; Privacy and Processing Integrity added later).
2. **Control gaps** already tracked in `docs/RISK_REGISTER.md`.
3. **Type I** target: within 6 months of first paying customer.
4. **Type II** target: within 12 months of Type I (minimum 6-month observation window).
5. **HITRUST r2** — evaluated post-SOC 2 based on customer demand.

Key remediation prerequisites (from `RISK_REGISTER.md`):

- Narrow `EXECUTE` on `claim_next_queue_job` and `recover_stalled_queue_jobs` to `service_role`.
- Establish CI/CD with typecheck, tests, dependency scan, migration linter.
- Fix currently-failing test fixtures.
- Publish and version SDLC, access-review, incident-response, and change-management policies.

---

## 15. Security Architecture Summary

**Implemented — one-page mental model:**

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                            │
│   • RequireAuth / RequireRole route guards                         │
│   • Supabase JWT in localStorage (sb-…-auth-token)                 │
│   • Never logs PHI (policy; CI lint Planned)                       │
└──────────────────────┬─────────────────────────────────────────────┘
                       │  HTTPS / TLS 1.2+
┌──────────────────────▼─────────────────────────────────────────────┐
│  Lovable Cloud (managed Supabase)                                  │
│                                                                    │
│   Auth  ─►  JWT (org_id claim via organization_members join)       │
│                                                                    │
│   Postgres (public schema, RLS on 36 tables)                       │
│    • org_id NOT NULL on every operational row                      │
│    • Policies: is_org_member / has_org_role (SECURITY DEFINER)     │
│    • Audit: ops_events (append-only)                               │
│              traces (SHA-256 fingerprinted)                        │
│              replay_ledger_events / replay_records (immutable)     │
│    • Idempotency: idempotency_keys                                 │
│                                                                    │
│   Storage (private buckets)                                        │
│    • evidence-documents  (PHI, org_id/… keys, no root uploads)     │
│    • appeal-packets      (PHI, signed URLs only)                   │
│                                                                    │
│   Edge Functions                                                   │
│    • invite-member                                                 │
│    • scheduler-dispatcher                                          │
│    • worker-dispatcher                                             │
│    (service_role scoped; egress limited to platform + AI gateway)  │
└────────────────────────────────────────────────────────────────────┘
```

**Non-negotiables enforced today:**

- No anonymous access on operational tables.
- No `NULL org_id` on operational rows.
- No raw PHI in `ops_events.summary`, in edge-function logs, or in browser console output.
- No public storage buckets.
- No cross-tenant joins in application code.
- Every migration that adds a `public` table ships GRANT + RLS + POLICY in the same file.

**Top Planned upgrades (tracked in `RISK_REGISTER.md`):**

1. Narrow `EXECUTE` on job-queue functions to `service_role` only.
2. CI/CD with typecheck, tests, dependency scan, migration linter, SAST, secret scan.
3. MFA enforcement + HIBP password check.
4. Column-encryption for `member_id`; envelope-encryption for EDI payloads.
5. Documented RTO/RPO with quarterly restore rehearsal.
6. Formal SOC 2 Type I → Type II track and HIPAA BAA on file.
7. External SIEM forwarding and alerting on high-risk event sequences.

---

*This document is reviewed at least quarterly and after any material change to authentication, tenancy, storage, or audit surfaces. Substantive updates are recorded in `ops_events` under `kind='audit_export_completed'` when exported to customers or auditors.*
