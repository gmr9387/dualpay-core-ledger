# Valtaris Extraction Map

**Source:** Phase 4C ValtariOS Extraction Findings  
**Date:** 2026-06-29  
**Purpose:** Documents how DualPay / Claim Clarity is decomposed into the four Valtaris platform layers, establishing the extraction boundary for each reusable subsystem.

---

## Overview

DualPay (Claim Clarity) is the commercial wedge application of the Valtaris ecosystem. During Phase 4C, the codebase was audited to identify which logic belongs to each platform layer so that each layer can be extracted as a standalone, reusable package.

```
┌─────────────────────────────────────────────┐
│          DualPay / Claim Clarity            │  ← Reference App
│  (denial recovery, COB, remittance intel)   │
└────────────┬──────────────┬─────────────────┘
             │              │
     ┌───────▼──────┐  ┌────▼─────────────┐
     │    Weaver    │  │      Glue         │
     │  (Context    │  │  (Workflow        │
     │  Intelligence│  │   Runtime)        │
     └───────┬──────┘  └────┬─────────────┘
             │              │
     ┌───────▼──────────────▼─────────────────┐
     │          ValtariOS / Core               │
     │  (COB · Adjudication · Trace Engine)   │
     └────────────────────┬────────────────────┘
                          │
     ┌────────────────────▼────────────────────┐
     │               Glue Cloud                │
     │   (Tenancy · RLS · Audit · Auth)        │
     └─────────────────────────────────────────┘
```

---

## Layer 1 — Glue Cloud (Tenancy, Security, Audit)

**What it is:** The multi-tenant infrastructure layer. Provides org isolation, Row-Level Security, identity, audit trails, and storage.

**Extracted from DualPay:**

| Concept | DualPay Source File(s) |
|---|---|
| Multi-org tenancy model | `supabase/migrations/` (org_id NOT NULL, RLS on every table) |
| Organisation RBAC | `src/lib/role-permissions.ts` |
| Supabase Auth integration | `src/integrations/supabase/client.ts`, `src/pages/Signup.tsx`, `src/pages/Login.tsx` |
| Org membership management | `src/hooks/use-org.ts`, `src/hooks/use-org-members.ts` |
| Password policy | `src/lib/password-policy.ts` (min 8, complexity) |
| Ops event audit trail | `src/lib/ops-events.ts`, `src/hooks/use-ops-events.ts` |
| PHI-safe audit export | `src/lib/audit-export.ts` |
| Storage RLS (evidence, packets) | `supabase/migrations/` (storage path = `org_id/...`) |
| Admin security console | `src/pages/admin/Security.tsx`, `src/pages/admin/AuditExport.tsx` |

**Extraction boundary:**
- Input: authenticated Supabase session + org_id
- Output: `useOrg()`, `useOrgMembers()`, `hasOrgRole()`, `appendOpsEvent()`
- No domain logic (no adjudication, no denial scoring)

---

## Layer 2 — ValtariOS / Core (COB · Adjudication · Trace Engine)

**What it is:** The deterministic adjudication kernel. Pure TypeScript functions — no side effects, no I/O. Suitable for server, edge, or client execution.

**Extracted from DualPay:**

| Concept | DualPay Source File(s) |
|---|---|
| Fee-schedule adjudication | `src/engine/calculation-engine.ts` — `adjudicateLine`, `adjudicateClaim`, `calculateAllowed` |
| COB rules engine | `src/engine/cob-rules.ts` — `calculateCOBAllocation`, `determineCOBPrimacy`, `birthdayRule` |
| Deductible / OOP accumulator | `src/engine/calculation-engine.ts` — `initSessionAccumulator` |
| Benefit limit enforcement | `src/engine/calculation-engine.ts` — `applyBenefitLimit` |
| Line adjudication invariant | `src/engine/calculation-engine.ts` — `assertLineInvariant` |
| Deterministic trace builder | `src/engine/trace-builder.ts`, `src/types/trace.ts` |
| Trace verifier | `src/engine/trace-verifier.ts` |
| Replay snapshot | `src/engine/replay-snapshot.ts` |
| Replay engine | `src/engine/replay-engine.ts` |
| Replay store (cache + persistence) | `src/engine/replay-store.ts` |
| Replay ledger | `src/engine/replay-ledger.ts` |
| Canonical JSON hash | `src/engine/hash.ts`, `src/engine/canonical-json.ts` |
| Password policy (shared rule) | `src/lib/password-policy.ts` |

**Claim type model:**

| Type | DualPay Source File |
|---|---|
| `ClaimLine`, `ContractTerms`, `PlanBenefits` | `src/types/claim.ts` |
| `AdjudicationRun`, `AdjudicationLineResult` | `src/types/claim.ts` |
| `PriorPayerOutcome`, `COBAllocation` | `src/types/claim.ts` |
| `TraceObject`, `MathStep`, `RuleFiring` | `src/types/trace.ts` |

**Extraction boundary:**
- Input: `ClaimLine[]`, `MemberAccumulators`, `ContractTerms`, `PlanBenefits`, `PriorPayerOutcome[]`
- Output: `{ run: AdjudicationRun; trace: TraceObject }`
- Zero imports from Supabase, React, or any UI layer
- Fully unit-testable (see `src/test/calculation-engine.test.ts`, `src/test/cob-rules.test.ts`)

---

## Layer 3 — Glue (Workflow Runtime)

**What it is:** The orchestration and job execution layer. Chains deterministic engines into audited, recoverable pipelines. Handles idempotency, retries, dead-letter queuing, and background execution.

**Extracted from DualPay:**

| Concept | DualPay Source File(s) |
|---|---|
| Job runner (7 job types) | `src/engine/job-runner.ts` |
| Pipeline orchestrator | `src/engine/pipeline-orchestrator.ts` |
| Automation rules engine | `src/engine/automation-rules.ts` |
| State machine (claim lifecycle) | `src/engine/state-machine.ts` |
| Persistent idempotency | `src/engine/state-machine.ts` — `canTransitionWithPersistentIdempotency` |
| Retry engine | `src/engine/retry-engine.ts` |
| Dead letter queue | `src/engine/dead-letter-queue.ts` |
| Queue manager | `src/engine/queue-manager.ts` |
| Worker executor | `src/engine/worker-executor.ts` |
| SLA engine | `src/engine/sla.ts` |
| Escalation engine | `src/engine/escalations.ts` |
| Recoverability scoring | `src/engine/recoverability.ts` |

**Extraction boundary:**
- Input: job type + config + org_id + Supabase client
- Output: `JobResult` (records processed / succeeded / failed / recovery value)
- Depends on ValtariOS/Core for adjudication math; depends on Glue Cloud for tenancy + audit
- No UI dependency

---

## Layer 4 — Weaver (Context Intelligence)

**What it is:** The intelligence and explainability layer. Produces human-readable insights, scores, recommendations, and narratives from raw claims and outcomes data.

**Extracted from DualPay:**

| Concept | DualPay Source File(s) |
|---|---|
| CARC/RARC denial intelligence | `src/engine/denial-intelligence.ts` |
| Next-best-action recommendations | `src/engine/next-action.ts` |
| Playbook recommendation engine | `src/engine/playbooks.ts` |
| Playbook effectiveness analytics | `src/engine/playbook-effectiveness.ts` |
| Decision explainability | `src/engine/explainability.ts` |
| Outcome analytics | `src/engine/outcome-analytics.ts` |
| Recovery attribution | `src/engine/recovery-attribution.ts` |
| Payer performance scorecards | `src/engine/payer-performance.ts` |
| Payer profile | `src/engine/payer-profile.ts` |
| Payer requirements | `src/engine/payer-requirements.ts` |
| Trust metrics | `src/engine/trust-metrics.ts` |
| Value realization narratives | `src/engine/value-realization.ts` |
| Forecasting | `src/engine/forecasting.ts` |
| Appeal readiness scoring | `src/engine/appeal-readiness.ts` |
| Evidence readiness scoring | `src/engine/evidence-readiness.ts` |
| Sufficiency scoring | `src/engine/sufficiency.ts` |
| Leak detection | `src/engine/leak-detection.ts` |
| Contract underpayment detection | `src/engine/contract-underpayment.ts` |
| Dispute generation | `src/engine/dispute-generator.ts` |

**Extraction boundary:**
- Input: persisted claims, cases, ops_events, outcomes, contracts — read via repository layer
- Output: typed score/recommendation objects (`DenialClassification`, `NextAction`, `PlaybookRecommendation`, etc.)
- Depends on Glue Cloud for data access; depends on ValtariOS/Core for adjudication primitives
- No UI imports

---

## DualPay as Reference Application

DualPay / Claim Clarity sits above all four layers. It provides:

- **React UI** — all pages under `src/pages/`, components under `src/components/`
- **Data bridge** — `src/data/repository.ts` (sole bridge between engines and Supabase)
- **Hooks** — `src/hooks/` (React integration of Glue Cloud + Weaver outputs)
- **Routes** — Vite/React Router wiring in `src/App.tsx`

DualPay does **not** contain adjudication logic, COB math, or intelligence scoring. All domain logic lives in the layers above. The application is a thin presentation layer over the platform.

---

## Extraction Priority Order

| Priority | Layer | Rationale |
|---|---|---|
| 1 | ValtariOS / Core | Pure functions, zero deps, immediately portable |
| 2 | Glue Cloud | Required by both Glue and Weaver; unlocks multi-tenant SaaS |
| 3 | Glue | Enables server-side autonomous pipelines without browser session |
| 4 | Weaver | Highest domain specificity; benefits from stable Core and Cloud APIs first |

---

## Notes

- All four layers are currently co-located in this monorepo. Extraction means moving each layer into its own package (npm workspace or separate repo) with a stable public API.
- The `src/data/repository.ts` file is the only file that imports from both the engine layers and Supabase. It is the natural extraction seam.
- Engine files in `src/engine/` that import only from `src/types/` and each other are already extraction-ready.
- Engine files that import from `src/data/repository.ts` or `@/integrations/supabase/` belong to the Glue layer, not ValtariOS/Core.
