# DualPay — HIPAA Overview

**Document owner:** Security & Compliance
**Status:** Internal working draft (not an attestation)
**Scope:** DualPay multi-tenant claims adjudication, denial recovery, and contract-underpayment platform (React 18 + Vite frontend, Lovable Cloud / Supabase Postgres + Auth + Storage + Edge Functions backend).
**Regulatory frame:** HIPAA Privacy Rule (45 CFR §164.500–534), Security Rule (§164.302–318), Breach Notification Rule (§164.400–414), and applicable Business Associate obligations.

> This document describes the technical controls implemented in the codebase today. It is **not** a HIPAA compliance certification. Formal compliance requires an executed BAA with the hosting provider, written policies and procedures, workforce training, a Security Risk Analysis under §164.308(a)(1)(ii)(A), and an independent audit.

---

## 1. PHI Inventory

DualPay processes **Protected Health Information (PHI)** and **Electronic PHI (ePHI)** as a Business Associate on behalf of covered-entity providers. PHI is co-located with adjudication, denial-recovery, and contract data.

### 1.1 Structured PHI — public schema tables

| Table | PHI / ePHI elements present | Purpose | Notes |
|---|---|---|---|
| `claims` | Patient identifiers (via claim payloads), DOS, diagnosis codes, procedure codes, billed amounts, payer, member IDs | Core claim record | Row-level scoped by `org_id` |
| `remittance_batches` | Payer, check/EFT numbers, remittance totals, dates | 835 ERA metadata | May reference patients via `remittance_lines` |
| `remittance_lines` | Patient account #, member ID, service dates, adjudicated amounts, CARC/RARC | 835 line detail — **highest PHI density** | RLS enforced |
| `member_accumulators` | Member ID, plan period, deductible/OOP consumed | Cost-share tracking | Contains member identifiers |
| `edi_transactions` | Raw X12 837/835/277 payloads | Ingestion buffer | Full clearinghouse envelopes |
| `edi_segments` | Parsed X12 segments | Line-level EDI | Contains NM1, DMG, DTP, HI segments |
| `adjudication_runs` | Claim FK, computed allowed/paid/patient-responsibility | Deterministic calc results | PHI via FK to `claims` |
| `traces` | Trace payloads, rule firings, hashes | Explainability / audit | Contains snapshotted claim state |
| `cases`, `case_events`, `case_claim_links` | Case narratives, timeline, linked claims | Denial-recovery workflow | Free-text may contain PHI |
| `claim_assignments` | Claim FK, assigned user | Workqueue ownership | Identifiers only |
| `evidence_documents` | Filename, mime, storage path, denial/claim FK | Metadata for uploads (records, EOBs, appeals) | See §1.2 |
| `recovery_outcomes` | Claim FK, disposition, dollars recovered | Post-appeal ledger | Amounts + FK |
| `underpayment_disputes` | Claim FK, expected vs paid, dispute notes | Contract enforcement | Financial + PHI FK |
| `import_batches`, `import_exceptions` | Source file metadata, exception rows | Ingestion pipeline | Exception rows may contain PHI |
| `ops_events` | Structured event stream, `summary`, `payload`, `claim_id`, actor identity | Immutable operational log | Never write raw PHI into `summary` — see §2 |
| `automation_rules`, `automation_jobs` | Rule config, job payloads | Automation engine | Payloads may reference PHI by FK |
| `payer_contracts`, `fee_schedules` | Contract terms, rates | Not PHI | Non-PHI reference data |
| `organizations`, `organization_members` | Tenant + membership | Not PHI | Auth boundary |

### 1.2 Unstructured PHI — Supabase Storage

| Bucket | Public | Contents | PHI risk |
|---|---|---|---|
| `evidence-documents` | **Private** | Medical records, authorizations, referrals, appeal letters, clinical notes, EOBs, remittance PDFs, payer correspondence | **High** — direct PHI |
| `appeal-packets` | **Private** | Generated appeal PDFs bundling evidence + narrative | **High** — direct PHI |

Object paths are prefixed by `org_id/…` and access is mediated by Storage RLS policies scoped to `is_org_member(org_id, auth.uid())`.

### 1.3 PHI in transit / ephemeral

- **Browser session storage**: Supabase JWT + refresh token in `localStorage`. No PHI cached in `localStorage`.
- **Edge Functions** (`invite-member`, `scheduler-dispatcher`, `worker-dispatcher`): handle IDs only; do not persist PHI to logs.
- **React Query cache**: in-memory only; cleared on tab close.

### 1.4 Data explicitly excluded from PHI

`organizations`, `organization_members`, `payer_contracts`, `fee_schedules`, `automation_rules` (config), `worker_registry`, `scheduler_runs`, `job_queue`, `job_runs`, `job_failures`, `replay_ledger_events`, `replay_records`, `recovery_lineage_events`, `idempotency_keys` — operational/config metadata only.

---

## 2. PHI Handling

**Minimum Necessary principle (§164.502(b))** is applied through:

1. **RLS everywhere.** Every public-schema table with PHI has `ENABLE ROW LEVEL SECURITY` and an `org_id`-scoped policy family (`*_select`, `*_insert`, `*_update`, `*_delete`). See `src/pages/AdminSecurity.tsx` for the mirrored inventory.
2. **Role-scoped writes.** `has_org_role(_org_id, auth.uid(), ARRAY['analyst','manager','admin','owner'])` gates writes; deletes require `manager+`.
3. **No PHI in `ops_events.summary`.** The `summary` field is a human-readable operational message; PHI-adjacent fields (patient identifiers, diagnoses) must not be inlined. Structured references travel via `claim_id` FK only. This is a code-review invariant enforced in `src/lib/ops-events.ts`.
4. **No PHI in URLs.** Routes use opaque `claim_id` / `denial_id` UUIDs; no member IDs or names in path or query strings.
5. **Deterministic redaction on export.** `src/lib/audit-export.ts` and `src/lib/pdf-appeal.ts` emit only fields explicitly whitelisted for the export type.
6. **Canonical hashing for evidentiary integrity.** `src/engine/hash.ts` + `src/engine/canonical-json.ts` produce SHA-256 fingerprints for traces, runs, and content — supports tamper detection under §164.312(c)(1).

---

## 3. Encryption at Rest (§164.312(a)(2)(iv))

| Layer | Mechanism | Notes |
|---|---|---|
| Postgres data + WAL | AES-256 provider-managed disk encryption | Provided by hosting platform |
| Storage buckets (`evidence-documents`, `appeal-packets`) | Server-side AES-256 at the object-storage layer | Provider-managed keys |
| Backups / point-in-time recovery | Same disk/object encryption inherited | Provider-managed |
| Application-layer field encryption | **Not currently implemented** | Gap — see §10 |
| Browser `localStorage` (JWT only) | No custom encryption; HttpOnly not available in SPA flow | Access token has short TTL + rotation |

**Gap:** No column-level encryption for high-sensitivity fields (member IDs, DOB embedded in claim JSON). Provider-managed disk encryption satisfies HIPAA "encryption addressable" for storage at rest but a future hardening step should introduce `pgcrypto`-backed field encryption for member identifiers in `claims` and `remittance_lines`.

---

## 4. Encryption in Transit (§164.312(e)(1))

- **All client ↔ backend traffic:** TLS 1.2+ enforced by the hosting platform. HTTPS-only.
- **Client ↔ Storage:** TLS to object storage endpoints; signed URLs are single-use / short-lived.
- **Edge Function ↔ Postgres:** TLS inside the provider network.
- **X12 ingestion (`src/lib/edi-gateway.ts`):** currently a stub — future direct clearinghouse links (Availity, Waystar, Change Healthcare) MUST terminate TLS 1.2+ and use mTLS or SFTP with key-based auth. See §10.
- **No plaintext egress channels** (no unencrypted SMTP, no plaintext webhooks).

---

## 5. Access Controls (§164.308(a)(4), §164.312(a)(1))

### 5.1 Authentication
- Supabase Auth: email/password + Google OAuth.
- JWT access tokens with automatic rotation (`autoRefreshToken: true` in `src/integrations/supabase/client.ts`).
- Session persisted in `localStorage` under `sb-<project>-auth-token`.
- **Gap:** MFA not currently enforced; leaked-password protection (HIBP) should be verified enabled. See §10.

### 5.2 Authorization — role hierarchy
Defined in `organization_members.role`, evaluated via `has_org_role()`:

| Role | Read | Write | Delete | Admin |
|---|---|---|---|---|
| `analyst` | ✅ | ✅ (own org) | ❌ | ❌ |
| `manager` | ✅ | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `owner` | ✅ | ✅ | ✅ | ✅ |

Enforced twice: **RLS in Postgres** (authoritative) and **`RequireRole` in React** (`src/components/auth/RequireRole.tsx`, UX only).

### 5.3 SECURITY DEFINER helpers
`is_org_member`, `has_org_role`, `current_org_id`, `handle_new_user_org`, `set_default_org_id`, `claim_next_queue_job`, `recover_stalled_queue_jobs`, `touch_updated_at`. All set `search_path = public`; `EXECUTE` on the two job-queue functions should be restricted to `service_role` — see §10.

### 5.4 Session management
- Idle-refresh via Supabase client.
- `RequireAuth` guard on every non-public route.
- Logout clears `localStorage` session key.

---

## 6. Audit Logging (§164.312(b))

DualPay implements **three complementary immutable logs**:

1. **`ops_events`** — application-level event stream. Every workflow transition, assignment change, escalation, upload, appeal packet generation, contract match, dispute, EDI event, and pipeline milestone is appended via `appendOpsEvent()` (`src/lib/ops-events.ts`). Each row carries `actor_user_id`, `actor_email`, `actor_name`, `occurred_at`, `kind`, `claim_id`, and a structured `payload`. Kind taxonomy is exhaustively enumerated in `OpsEventKind`. Append-only (`clearOpsEvents` is a no-op).
2. **`traces`** — adjudication trace records with SHA-256 fingerprints. Supports full replay via `src/engine/replay-engine.ts` and verification via `src/engine/trace-verifier.ts`.
3. **`replay_ledger_events` + `replay_records`** — immutable ledger of every replay attempt, for cross-verification and dispute defense.

Additional job telemetry: `job_runs`, `job_failures`, `worker_registry`, `scheduler_runs`.

**Retention:** Retention policy has not yet been formalized. HIPAA requires 6-year retention for audit records tied to compliance activity (§164.316(b)(2)). Current tables are append-only with no automated purge; codify in policy — see §10.

**Audit surfaces:**
- `/audit-trace` (`src/pages/AuditTrace.tsx`) — merged ops + trace timeline
- `/admin/security` — RLS + SECURITY DEFINER inventory
- `/admin/audit` — full ops log with filters (see roadmap for per-user timelines)

---

## 7. Tenant Isolation

Multi-tenancy is enforced at **three defense-in-depth layers**:

1. **Row-Level Security.** All 36 public tables carry `org_id UUID NOT NULL` with an `org_id_default` trigger (`set_default_org_id`) resolving from `current_org_id()`. Every policy calls `is_org_member(org_id, auth.uid())`. No table permits `NULL org_id`.
2. **Storage RLS.** `storage.objects` policies for `evidence-documents` and `appeal-packets` gate access by the `org_id/…` path prefix and `is_org_member`. Root-level uploads are explicitly blocked (see migration `20260710182913_af0f38ed…`).
3. **Application context.** `useOrg()` binds the active org; every mutation resolves `currentOrg.org_id`. React Query caches are keyed by org.

**Explicitly prevented cross-tenant scenarios:**
- No global admin bypass in application code.
- No `security_barrier = off` views on PHI tables.
- No connection pooler bypass; all traffic authenticates as `authenticated` role with JWT `sub` claim.
- No signed URLs shared across orgs — every signed URL is minted server-side against a specific object path.

---

## 8. Incident Response

**Current posture:** foundational logging is in place; a formal IR runbook has not yet been written. Skeleton procedure below is what the codebase supports today.

### 8.1 Detection sources
- `job_failures`, `edi_errors` — pipeline failure signals
- `ops_events` kinds `job_failed`, `job_dead_lettered`, `stalled_job_recovered`, `edi_rejected`
- Supabase Auth logs (provider dashboard) — unusual signin patterns
- `traces` fingerprint mismatch on replay — tamper indicator (`src/engine/trace-verifier.ts`)

### 8.2 Response phases (§164.308(a)(6))

| Phase | Action | Artifact |
|---|---|---|
| Identify | Confirm event via `ops_events` query + affected `org_id`, `claim_id`, `user_id` | Incident ticket |
| Contain | Revoke session tokens (Supabase Auth API), rotate keys, disable affected user in `organization_members`, disable automation rules | Change log |
| Eradicate | Patch code path; migrate RLS if policy gap; rotate storage signing keys | Migration + PR |
| Recover | Replay affected traces to verify data integrity; restore from PITR if data corruption | `replay_records` |
| Notify | If unsecured PHI breach affecting ≥500 individuals → notify HHS within 60 days (§164.408); notify affected individuals within 60 days (§164.404); notify covered-entity customers per BAA | Breach log |
| Lessons | Post-mortem; update RLS, roles, or code-review checklist; add regression test | `/docs/` |

### 8.3 Contacts
Currently undefined in code. Populate: Privacy Officer, Security Officer, Legal, primary hosting/BAA contact.

---

## 9. Backup Strategy

- **Postgres:** Provider-managed daily backups + Point-in-Time Recovery (PITR) within the retention window supported by the hosting tier.
- **Storage buckets:** Object-storage durability guarantees at the provider layer.
- **No user-managed off-cloud backup** is configured today.
- **Restore rehearsal:** Not yet formalized. HIPAA contingency plan (§164.308(a)(7)) requires a written data-backup, disaster-recovery, and emergency-mode operation plan plus periodic testing.

**Recommended additions (§10):** documented RPO/RTO, quarterly restore drill, off-region backup replica, encrypted export of `evidence-documents` and `appeal-packets` to secondary storage.

---

## 10. Known Gaps & Remediation Backlog

| # | Gap | Severity | Remediation |
|---|---|---|---|
| 1 | No column-level encryption for member identifiers | Medium | `pgcrypto` field encryption on `claims.member_id`, `remittance_lines.member_id` |
| 2 | MFA not enforced for admin/owner roles | High | Enable Supabase MFA; require for `admin`+ |
| 3 | HIBP leaked-password check may be off | Medium | Enable via `configure_auth` |
| 4 | `EXECUTE` on `claim_next_queue_job` / `recover_stalled_queue_jobs` granted broadly | Medium | `REVOKE EXECUTE … FROM anon, authenticated; GRANT … TO service_role` |
| 5 | No formal retention policy | High | Written 6-year retention + purge job for non-audit tables |
| 6 | No formal IR runbook / named officers | High | Publish IR plan, name Security & Privacy Officers |
| 7 | No documented DR/RPO/RTO or restore drill | High | Quarterly PITR restore test; document RPO=24h, RTO=4h target |
| 8 | Direct clearinghouse links (EDI) still stubbed | Medium | Implement mTLS/SFTP with rotating keys before production |
| 9 | Workforce training + BAA templates not in-repo | High | Non-technical; policy work |
| 10 | No automated PHI-in-logs scanner | Medium | CI check on `ops_events.summary` and console logs |

---

## 11. Cross-references

- `src/pages/AdminSecurity.tsx` — live RLS inventory
- `src/lib/ops-events.ts` — audit event API
- `src/engine/hash.ts`, `src/engine/trace-verifier.ts` — integrity
- `supabase/migrations/` — all RLS + policy changes (versioned)
- `/docs/RISK_REGISTER.md` — companion risk register (SOC 2 lens)
