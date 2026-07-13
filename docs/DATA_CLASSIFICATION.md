# DualPay — Data Classification

**Document owner:** Security & Compliance
**Status:** Internal working draft
**Companions:** [`HIPAA_OVERVIEW.md`](./HIPAA_OVERVIEW.md), [`RISK_REGISTER.md`](./RISK_REGISTER.md)

## Classification Scheme

| Level | Definition | Examples | Handling floor |
|---|---|---|---|
| **Public** | Safe for open publication; no confidentiality obligation. | Marketing pages, robots.txt, OSS deps. | TLS in transit; integrity only. |
| **Internal** | Non-sensitive operational data. Disclosure is embarrassing, not harmful. | Config-as-code, worker telemetry, job queue metadata. | Auth required; RLS org-scoped; TLS. |
| **Confidential** | Business-sensitive: financial, contractual, tenant, or auth data. Regulated by contract, not HIPAA. | Payer contracts, fee schedules, org membership, roles, audit logs referencing money. | Auth + role-scoped RLS; encrypted at rest; audit reads on export; no cross-tenant sharing. |
| **PHI / ePHI** | Protected Health Information under HIPAA §160.103. Any 18-identifier element tied to health, payment, or care. | Claims, remittance lines, EDI 837/835 payloads, evidence PDFs, member accumulators. | All Confidential controls **plus**: BAA required; §164.312 audit + integrity + transmission security; 6-year audit retention; breach-notification eligible. |

Rule of thumb: **any row/object joinable to a specific patient or member ID is PHI**, even if the immediate columns look benign.

---

## 1. Public-Schema Tables

| Table | Classification | Justification | Handling requirements |
|---|---|---|---|
| `organizations` | Confidential | Tenant identity; disclosure enables tenant enumeration. | RLS `is_org_member`; no anon access; audit reads. |
| `organization_members` | Confidential | Auth boundary + role assignments; privilege-escalation surface. | Bootstrap-only self-insert; role changes via `owner`/`admin`; log every change to `ops_events`. |
| `claims` | **PHI** | Patient/member IDs, DOS, diagnosis, procedure codes, billed amounts. | RLS `org_id`; role-scoped writes; no PHI in URLs; audit all reads over threshold; column-encrypt member_id (planned). |
| `remittance_batches` | **PHI** | 835 envelope tied to payer + patients via lines. | RLS org-scoped; retain 6y; no export outside signed URLs. |
| `remittance_lines` | **PHI** (highest density) | Patient acct #, member ID, service dates, adjudicated amounts, CARC/RARC. | RLS; column-encrypt member_id (planned); redact on export; audit reads. |
| `member_accumulators` | **PHI** | Member ID + plan-period cost-share. | RLS; retain 6y; no cross-tenant joins. |
| `edi_transactions` | **PHI** | Raw X12 837/835/277 payloads (full envelopes). | RLS; treat payload column as opaque; never log payload; encrypt at rest (planned). |
| `edi_segments` | **PHI** | Parsed NM1/DMG/DTP/HI segments. | RLS; redaction on export. |
| `edi_errors` | **PHI** (assume) | Error rows often carry offending segment content. | RLS; scrub payload before surfacing to shared dashboards. |
| `adjudication_runs` | **PHI** | FK to claims + computed patient-responsibility. | RLS; immutable; retain per audit policy. |
| `traces` | **PHI** | Snapshotted claim state, rule firings, hashes. | RLS; append-only; SHA-256 integrity verified via `trace-verifier`. |
| `cases` | **PHI** | Free-text narratives may contain PHI. | RLS role-scoped; no PHI in `summary` sent to `ops_events`. |
| `case_events` | **PHI** | Timeline referencing claims/members. | RLS; append-only. |
| `case_claim_links` | **PHI** | Case ↔ claim linkage. | RLS. |
| `claim_assignments` | Confidential | Claim FK + assigned user; identifiers only, but joinable to PHI. | RLS; standardize unassign to `NULL`; log to `ops_events`. |
| `claim_source_links` | **PHI** | Links to source (EDI/remit) rows that carry PHI. | RLS. |
| `evidence_documents` | **PHI** | Metadata for medical records, EOBs, appeals. | RLS; storage path `org_id/…`; single-use signed URLs. |
| `recovery_outcomes` | **PHI** | Claim FK + dollars recovered + disposition. | RLS; immutable ledger. |
| `underpayment_disputes` | **PHI** | Claim FK + contract dispute narrative. | RLS role-scoped. |
| `import_batches` | Confidential | File-level metadata; classification rises to PHI if filename encodes patient. | RLS; forbid PHI in filenames (policy). |
| `import_exceptions` | **PHI** (assume) | Exception rows contain original claim fields. | RLS; scrub before analytics export. |
| `field_mappings` | Internal | Column-mapping config. | RLS org-scoped. |
| `ops_events` | Confidential | Structured event stream + actor identity + claim_id FK. **Must not contain raw PHI in `summary`.** | Append-only; invariant enforced in `src/lib/ops-events.ts`; 6-year retention. |
| `automation_rules` | Confidential | Rule config + rule expressions. | RLS; role-gated writes. |
| `automation_jobs` | **PHI** | Job payloads reference claims/members. | RLS; scrub payload previews. |
| `payer_contracts` | Confidential | Contract terms, negotiated rates — commercially sensitive, not PHI. | RLS; export requires `manager+`. |
| `fee_schedules` | Confidential | Contract rate schedules. | RLS; version-controlled. |
| `job_queue` | Internal | Queue rows may carry claim FK → treat payload as PHI when populated. | RLS; `EXECUTE` on `claim_next_queue_job` restricted to `service_role`. |
| `job_runs` | Internal | Run telemetry. | RLS. |
| `job_failures` | Internal | Error metadata; scrub payload previews. | RLS. |
| `worker_registry` | Internal | Worker heartbeat + capability. | RLS; service-role writes. |
| `scheduler_runs` | Internal | Scheduler telemetry. | RLS. |
| `replay_ledger_events` | Confidential | Immutable replay attempts (references PHI by FK). | Append-only; integrity via hash. |
| `replay_records` | Confidential | Replay results + fingerprints. | Append-only. |
| `recovery_lineage_events` | Confidential | Lineage graph events (FKs to PHI). | Append-only. |
| `idempotency_keys` | Internal | Dedup tokens. | RLS; TTL purge. |

---

## 2. Storage Buckets

| Bucket | Public? | Classification | Contents | Handling |
|---|---|---|---|---|
| `evidence-documents` | Private | **PHI** | Medical records, authorizations, referrals, clinical notes, EOBs, remittance PDFs, payer correspondence. | Storage RLS by `org_id/…` prefix; root-level uploads blocked (migration `20260710182913…`); single-use signed URLs; virus scan on upload (planned); no cross-tenant path traversal. |
| `appeal-packets` | Private | **PHI** | Generated appeal PDFs bundling evidence + narrative. | Same as above; retention aligned with claim record. |

There are **no public buckets**. Any new bucket must default to private and go through the classification checklist below.

---

## 3. Logs

| Log surface | Location | Classification | Handling |
|---|---|---|---|
| `ops_events` (app event stream) | Postgres | Confidential | Never inline PHI in `summary`; reference PHI via `claim_id` FK only; append-only; 6y retention. |
| `traces` | Postgres | **PHI** | Snapshotted claim state; append-only; SHA-256 fingerprinted; RLS org-scoped. |
| `replay_ledger_events` / `replay_records` | Postgres | Confidential | Immutable; integrity hashes. |
| `job_runs` / `job_failures` / `scheduler_runs` | Postgres | Internal | Scrub payload previews before surfacing. |
| Edge function logs (`invite-member`, `scheduler-dispatcher`, `worker-dispatcher`) | Platform | Internal | IDs only; PHI-in-logs forbidden; CI scanner (planned). |
| Supabase Auth logs | Platform | Confidential | Provider dashboard only; retain per platform policy. |
| Postgres slow-query / pg_stat logs | Platform | Confidential | May contain literal predicates; restrict access to `admin`+. |
| Browser `console.*` | Client | Internal | Never log PHI. Enforce via lint rule (planned). |
| Browser `localStorage` (`sb-…-auth-token` only) | Client | Confidential | JWT only, no PHI cached. |

---

## 4. Exports

Every export path must (a) declare its classification, (b) whitelist fields, (c) sign URLs, and (d) emit an `ops_events` record.

| Export | Source | Classification | Handling |
|---|---|---|---|
| Appeal packet PDF (`src/lib/pdf-appeal.ts`) | claims + evidence + narrative | **PHI** | `manager+`; signed URL; logged (`kind='appeal_packet_generated'`); stored in `appeal-packets` bucket. |
| Audit export (`src/lib/audit-export.ts`) | `ops_events` + `traces` | Confidential | Field whitelist; `admin+`; watermark actor + timestamp; log `kind='audit_exported'`. |
| CSV export from operational lists (planned) | claims/denials/worklists | **PHI** (if includes patient identifiers) or Confidential (if aggregate) | Row-level filter must respect RLS; column whitelist per role; `ops_events` entry per export. |
| Config-as-Code export (rules, playbooks, contracts) | `automation_rules`, `payer_contracts`, `fee_schedules` | Confidential | `admin+`; version-hashed. |
| Regulator "Explanation Bundle" | trace + adjudication_runs + config snapshot | **PHI** | Named regulator recipient only; signed + hashed; audit-logged. |
| Analytics dashboards (Executive*) | aggregates over PHI tables | Confidential when de-identified; PHI otherwise | Prefer counts/sums; no member IDs surfaced; role-gated. |
| EDI outbound (`edi-gateway` — stubbed) | 837/276/275 | **PHI** | mTLS/SFTP to clearinghouse; key rotation; no plaintext egress. |

**Prohibited exports:** raw `edi_transactions.payload`, raw `remittance_lines` with member_id in the clear to non-BAA recipients, any bundle containing more than one org's data.

---

## 5. Classification Checklist (for new assets)

Before merging a migration, bucket, log surface, or export:

1. Does it carry, reference, or join to any 18-identifier element? → **PHI**.
2. Does it carry auth material, contract terms, roles, or actor identity? → **Confidential**.
3. Purely operational config/telemetry with no PHI join? → **Internal**.
4. Intended for external publication? → **Public** (rare; requires sign-off).
5. Confirm: RLS enabled; GRANTs match policy; no anon access; `service_role` where appropriate.
6. If **PHI**: add to §1 above; verify §164.312 controls; ensure `ops_events` invariant holds.
7. If exporting: whitelist fields, sign URLs, emit `ops_events`.

---

## 6. Summary Counts

- **Public** assets: 0 (no public tables, no public buckets).
- **Internal**: `field_mappings`, `job_runs`, `job_failures`, `worker_registry`, `scheduler_runs`, `idempotency_keys`, `job_queue` (payload-empty rows), edge/browser logs.
- **Confidential**: `organizations`, `organization_members`, `claim_assignments`, `ops_events`, `automation_rules`, `payer_contracts`, `fee_schedules`, `replay_*`, `recovery_lineage_events`, audit + config exports.
- **PHI**: `claims`, `remittance_batches`, `remittance_lines`, `member_accumulators`, `edi_transactions`, `edi_segments`, `edi_errors`, `adjudication_runs`, `traces`, `cases`, `case_events`, `case_claim_links`, `claim_source_links`, `evidence_documents`, `recovery_outcomes`, `underpayment_disputes`, `import_exceptions`, `automation_jobs`, both storage buckets, appeal/regulator exports, EDI outbound.
