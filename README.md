Claim Clarity / DualPay Core Ledger

Enterprise healthcare reimbursement intelligence platform for denial recovery, claim transparency, COB/payment logic, recovery operations, and audit-ready decision support.

Current Status

Claim Clarity has evolved from a denial dashboard into a recovery operations platform.

Implemented

* CARC/RARC denial intelligence
* Denial classification
* Recoverability scoring
* Severity scoring
* Evidence requirements
* Next-best-action recommendations
* Playbook recommendation engine
* Decision transparency
* “Why this score” explainability
* Outcome intelligence
* Recovery intelligence dashboard
* SLA management
* Escalation engine
* Workload management
* Payer operations
* Executive recovery pipeline
* Claim/adjudication/case persistence via Supabase
* RLS-backed backend foundation

Product Vision

Claim Clarity helps healthcare organizations identify denied or delayed reimbursement, understand why it happened, prioritize recoverable dollars, route work to the right teams, and prove recovery outcomes.

Core question:

Where is the money, why is it stuck, who owns it, and what action gets it recovered?

Architecture

Intelligence Engines

* denial-intelligence.ts
* next-action.ts
* playbooks.ts
* sla.ts
* escalations.ts

Core Data

Backend-persisted:

* claims
* member_accumulators
* adjudication_runs
* cases
* case_claim_links
* case_events
* traces

Currently being hardened:

* ops_events
* assignments
* recovery_outcomes

Current Phase

Phase 7 — Persistent Operations Backbone

Goal:

Move operational state from localStorage into Supabase.

Phase 7 focuses on:

* persistent ops events
* persistent assignments
* persistent recovery outcomes
* RLS policies
* durable audit history
* multi-user pilot readiness

No new intelligence engines should be created in Phase 7.

Why This Matters

Earlier phases made the system intelligent.

Phase 7 makes it durable.

This is the bridge from demo-ready to pilot-ready.

Pilot Readiness

Current readiness:

* Demo: strong
* Internal pilot: strong
* Small provider pilot: close
* Regional provider pilot: needs persistence hardening
* Health plan pilot: requires security/HIPAA hardening, integration, evidence workflow, and production controls

Tech Stack

* React
* TypeScript
* Vite
* Tailwind
* Supabase
* Postgres
* RLS
* Deterministic TypeScript engines
* Local-first UI patterns being migrated to backend persistence

Development Principle

Do not duplicate existing intelligence.

Extend the existing system.

Preferred pattern:

Claim data
→ denial intelligence
→ transparency
→ next action
→ recovery operations
→ persistent outcome
→ recovery analytics

Strategic Direction

Claim Clarity is the commercial wedge of the Valtaris ecosystem.

It is supported by:

* Cloud: tenancy, security, audit, connectors
* Glue: workflow execution/runtime
* Core: COB and adjudication intelligence
* Weaver: future context intelligence

Claim Clarity leads because it is closest to measurable business value:

Recovered dollars
Reduced denial aging
Improved appeal success
Lower operational backlog