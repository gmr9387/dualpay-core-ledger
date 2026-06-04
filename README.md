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
