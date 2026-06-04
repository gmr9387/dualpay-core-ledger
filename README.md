Claim Clarity / DualPay Core Ledger

Enterprise healthcare reimbursement intelligence platform for denial recovery, claim transparency, COB/payment logic, recovery operations, recovery factory ingestion, remittance intelligence, and executive value realization.

Current Status

Claim Clarity is a Recovery Operations + Value Realization platform.

Implemented

* CARC/RARC denial intelligence
* Denial classification, recoverability and severity scoring
* Evidence requirements & next-best-action recommendations
* Playbook recommendation engine
* Decision transparency / "Why this score" explainability
* Outcome intelligence + Recovery Intelligence dashboard
* SLA, escalation, workload, and payer operations
* Recovery Factory (bulk import, field mapping, validation)
* Import Exception Management (preserve, correct, retry)
* 835 Remittance Intelligence (normalization + classification)
* Persistent ops events, assignments, outcomes (Supabase + RLS)
* **Executive Intelligence (Phase 11)** — value realization, recovery
  attribution, payer scorecards, playbook effectiveness, deterministic
  narrative generation
* **Identity & RBAC (Phase 12)** — Supabase auth, organizations,
  org-scoped RLS, real actor identity in ops_events
* **Evidence Vault (Phase 13)** — Supabase Storage, versioned documents,
  appeal packet generator
* **Production Hardening (Phase 14)** — NOT NULL org_id, tightened RLS,
  admin console, security inventory, PHI-safe audit export
* **Contract Intelligence (Phase 15)** — payer_contracts +
  fee_schedules, contract-import / contract-match / contract-underpayment
  engines, dispute generator, contract analytics, dispute lifecycle

Product Vision

Where is the money, why is it stuck, who owns it, what action recovers
it, and how much did Claim Clarity actually return?

Architecture

Intelligence Engines (authoritative; not duplicated)

* denial-intelligence.ts
* next-action.ts
* playbooks.ts
* sla.ts
* escalations.ts
* outcome-analytics.ts
* import-validation.ts / import-to-claim.ts
* remittance-normalizer.ts / remittance-denial-extractor.ts

Phase 11 — Executive Value Realization

* recovery-attribution.ts — attribute recovered $ to category, payer,
  playbook, owner, resolution action
* payer-performance.ts — payer scorecards (denial / underpayment /
  recovery / appeal-success / top failure categories)
* playbook-effectiveness.ts — rank playbooks by recovery rate, $,
  resolution time, appeal success
* value-realization.ts — at-risk vs recovered, expected future
  recovery, monthly/category/payer breakdown, deterministic narrative

Routes added

* /executive             — Executive Home
* /executive/value       — Value Realization
* /executive/recovery    — Recovery Attribution drilldowns
* /executive/payers      — Payer Scorecards
* /executive/playbooks   — Playbook Effectiveness

Auditability

Every executive metric traces back to persisted Claims, DenialEvents,
RecoveryOutcomes, Playbooks, and OpsEvents. Slices with fewer than 5
outcomes return `insufficient: true` and the UI surfaces "Insufficient
Outcome History" instead of fabricated numbers.

Core Data (persisted)

* claims, member_accumulators, adjudication_runs
* cases, case_claim_links, case_events, traces
* ops_events, claim_assignments, recovery_outcomes
* import_batches, import_exceptions, field_mappings
* remittance_batches

Tech Stack

* React 18, TypeScript 5, Vite 5, Tailwind v3
* Supabase / Postgres with RLS
* Deterministic TypeScript engines (no ML, no fabricated data)

Development Principle

Do not duplicate existing intelligence. Extend the existing system.

Preferred pattern:

Claim data → denial intelligence → transparency → next action →
recovery operations → persistent outcome → recovery analytics →
executive attribution & value realization.

Strategic Direction

Claim Clarity is the commercial wedge of the Valtaris ecosystem,
supported by Cloud (tenancy/security/audit), Glue (workflow runtime),
Core (COB/adjudication), and Weaver (context intelligence).

---

## Phase 13 — Evidence Vault & Appeal Document Lifecycle

Real document management for denials, appeals, and recovery actions.

Routes

* /vault                       — Evidence Vault (search, filter, upload)
* /vault/:documentId           — Document detail + versions + audit
* /vault/claim/:claimId        — All documents for a claim + readiness + packet generator
* /vault/denial/:denialId      — Denial-scoped evidence upload + required-items checklist

Storage

* `evidence-documents` (private bucket) — uploaded evidence
* `appeal-packets`     (private bucket) — generated appeal packet snapshots
* Path convention: `<org_id>/<claim_id>/<uuid>_v<n>_<filename>`
* Supported formats: PDF, PNG, JPG, DOCX, XLSX

Persistence

* `evidence_documents` — org_id, claim_id, denial_id, storage_path, filename,
  mime_type, file_size, document_type, version, parent_document_id, uploader.
* RLS: org-scoped via `is_org_member` / `has_org_role`.
* Storage RLS keyed off the first path segment (`org_id`).

Security model

* Viewers — read.
* Analysts / Managers / Admins / Owners — upload + update.
* Managers / Admins / Owners — delete.

Versioning

* Re-uploading the same filename + type to the same claim auto-bumps
  the version; parent links are preserved. No file is ever overwritten
  in storage.

Auditability

* Every action appends to `ops_events`: `document_uploaded`,
  `document_linked`, `document_removed`, `appeal_packet_generated`.

Appeal Packet Generator

* `src/engine/appeal-packet-generator.ts` — deterministic Markdown packet
  with claim, denial, evidence checklist, attached documents, timeline,
  and recovery opportunity.
* Reuses `scoreEvidenceReadiness` — does not duplicate readiness logic.
* If readiness is not READY, the packet header reads
  "Appeal Packet Incomplete" and enumerates blocking gaps.

Reused engines (no duplication)

* `evidence-readiness`, `appeal-readiness`, `sufficiency`,
  `ops-events`, `use-org`.

## Phase 14 — Production Security, Audit Export & Tenancy Hardening

Tenancy backfill

* All operational records that lacked an organization were assigned to
  a `Legacy Demo Organization`.
* `org_id` is now `NOT NULL` on every operational table:
  claims, member_accumulators, adjudication_runs, cases, case_claim_links,
  case_events, traces, ops_events, claim_assignments, recovery_outcomes,
  import_batches, import_exceptions, field_mappings, remittance_batches,
  evidence_documents.

RLS hardening

* The temporary "if org_id is NULL, allow members" branch was removed from
  every operational policy.
* SELECT — org members only.
* INSERT / UPDATE — analyst, manager, admin, owner.
* DELETE — manager, admin, owner.
* No anonymous access. No globally permissive policy remains.
* Browseable inventory at `/admin/security`.

SECURITY DEFINER hardening

* `is_org_member`, `has_org_role`, `current_org_id` — EXECUTE restricted
  to `authenticated` (revoked from `PUBLIC`/`anon`).
* `set_default_org_id`, `handle_new_user_org`, `touch_updated_at` —
  trigger functions; EXECUTE revoked from `PUBLIC`/`anon`. They run
  with table-owner privileges only when fired by their triggers.

Audit export (`src/lib/audit-export.ts`)

* Datasets: ops events, escalations, assignments, recovery outcomes,
  evidence actions.
* Formats: CSV, JSON.
* Modes: **Full** (admin/owner only) and **Redacted** (member ids,
  personal identifiers, and sensitive filenames stripped).
* Every export emits `audit_export_requested` and
  `audit_export_completed` ops events with actor, dataset, mode,
  row count, and filename.

Admin console

* `/admin` — KPIs (members, organizations, audit events, exports, stored documents).
* `/admin/security` — RLS policy inventory + SECURITY DEFINER helper list.
* `/admin/audit` — configure and run audit exports.

Role-aware UI (`src/lib/role-permissions.ts`)

* `viewer` — read only; no upload, edit, assign, escalate, or delete controls.
* `analyst` — upload, edit, assign.
* `manager` — escalate, delete, run redacted exports.
* `admin` / `owner` — full exports, organization management, security console.
* `RequireRole` guards `/admin/*` routes; controls are hidden, not just disabled.

Reused (not rebuilt)

* Denial Intelligence, Recovery Operations, Executive Intelligence,
  Recovery Factory, Remittance Intelligence, Evidence Vault,
  Appeal Packet Generator, Identity / RBAC / Organizations.

Remaining production blockers

* No real EDI 835 / 837 parser (CSV-derived only).
* No payer contracts repository; underpayment detection still billed-vs-paid.
* No background jobs / scheduled workers.
* No observability stack (metrics, traces, alerting).
* `evidence_documents` row delete does not cascade-delete the storage object.
* Email/password is the only auth method; SSO, MFA, and password rotation policies not configured.

## Phase 16 — Autonomous Recovery Pipeline & Job Orchestration

The platform is no longer purely user-driven. Phase 16 introduces an
orchestrated automation layer that chains existing engines into a
deterministic, audited recovery pipeline.

Database

* `automation_jobs` — every job execution (type, status, started/completed,
  records processed/succeeded/failed, recovery value, pipeline_id linkage,
  result JSON). Org-scoped RLS; analyst+ can launch, manager+ can delete.
* `automation_rules` — configurable triggers (`underpayment_threshold`,
  `sla_risk`, `evidence_stale`, `denial_severity`, `repeat_payer_issue`)
  with JSON configuration and action list. Manager+ manages; analyst+ views.

Routes

* `/automation` — Automation Center: run the full recovery pipeline, fire
  individual jobs, see live KPIs.
* `/automation/jobs` — filterable job queue with throughput stats.
* `/automation/rules` — rule CRUD (manager+).
* `/automation/history` — pipeline runs, durations, value generated.

Engines added

* `engine/job-runner.ts` — registry of seven deterministic handlers
  (remittance_analysis, contract_matching, underpayment_detection,
  dispute_generation, recovery_case_generation, queue_assignment,
  executive_recalculation). Each handler reads existing persisted state and
  reuses authoritative engines — no fabricated data.
* `engine/pipeline-orchestrator.ts` — chains jobs under a shared
  `pipeline_id`. Single execution trace; per-step ok/value reporting.
* `engine/auto-case-generator.ts` — persists `cases` + initial `case_events`
  via the existing case-management helper.
* `engine/automation-rules.ts` — evaluates rules against a `RuleSignal` and
  applies `auto_case`, `assign_manager`, `escalate` actions.

Audit

* New `ops_events` kinds: `job_started`, `job_completed`, `job_failed`,
  `rule_triggered`, `case_auto_created`, `dispute_auto_created`,
  `pipeline_started`, `pipeline_completed`.

Reused (not rebuilt)

* Denial Intelligence, Recovery Operations, Executive Intelligence,
  Recovery Factory, Remittance Intelligence, Contract Intelligence,
  Evidence Vault, Identity / RBAC / Organizations, Audit Export.

Remaining limitations

* Dispute candidates for `dispute_generation` must be supplied via job
  config; there is no scheduled scanner that derives them from raw
  remittance lines yet.
* Rule editing beyond enable/disable + create is still JSON-via-console;
  no in-app config editor for thresholds and actions.
* Pipelines run synchronously in the browser session of the user who
  triggers them — no background worker / cron yet.
