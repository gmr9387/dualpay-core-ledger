# DualPay — Core Admin OS

Mission-critical core admin platform for health insurance claim adjudication. Built for **correctness, determinism, auditability, and replayability** — Facets-class parity, engine-first.

> **North Star:** reduce COB-related denials, shrink EOB call volume, accelerate multi-payer case turnaround, and maximize portal self-service resolution.

---

## What's built today (v2.3)

### 1. Adjudication Engine (`src/engine/calculation-engine.ts`)
- Deterministic, integer-cents math (no floats, no rounding drift)
- Allowed → deductible → copay → coinsurance → OOP-cap waterfall
- Per-line and per-claim totals
- Idempotent runs keyed by `run_id`

### 2. COB / Multi-Payer (`src/engine/cob-rules.ts`)
- Primary/secondary primacy resolution
- Birthday Rule, Gender Rule, Custodial Parent
- Secondary allocation: lower-of, COB savings, non-duplication
- Prior-payer outcome ingestion (835 / EOB stub)

### 3. Trace & Explainability (`src/engine/trace-builder.ts`, `explainability.ts`)
- Structured `TraceObject` per adjudication run: every input, rule fired, branch taken, dollar movement
- Human-readable explanation generator
- Replay-safe: same inputs → identical trace hash

### 4. State Machine (`src/engine/state-machine.ts`)
- 16 explicit transitions across Intake → COB → Adjudication → Payment → Terminal phases
- Guards: `REQUIRE_PRIMACY_CONFIRMATION`, `REQUIRE_IDEMPOTENCY_KEY`
- Visual diagram with live guard status (`StateDiagram.tsx`)

### 5. Case Management (`src/engine/case-management.ts`)
- N-claim → 1-case linking with cross-claim accumulator rollup
- Retro-recalculation: reversing claim N re-adjudicates claims N+1…M with corrected accumulators
- Field-level diff viewer (before / after / delta) for every changed line

### 6. Tests (`src/test/calculation-engine.test.ts`)
- Multi-payer scenario coverage: deductible + coinsurance, COB primacy, secondary allocation
- All engine tests green before any UI work

### 7. UI Surface (`src/pages/Index.tsx`)
- Claims queue, adjudication panel, trace viewer, stats bar
- Toggleable State Machine and Case panels
- Semantic-token theming, dark engine-console aesthetic

---

## Architecture

```text
Claim ──► CalculationEngine ──► AdjudicationRun ──► TraceObject
   │            │                      │
   │            ▼                      ▼
   │       COB Rules              Explainability
   │            │
   ▼            ▼
StateMachine  Case ──► RetroRecalc ──► AdjudicationDiff
                │
                ▼
       AccumulatorImpact
```

---

## Tech stack

Vite · React 18 · TypeScript 5 · Tailwind v3 · shadcn-ui · Vitest

---

## Product completeness assessment

See **[Assessment](#assessment-how-close-to-full-product)** below.

---

## Assessment: how close to full product

**Honest read: ~25–30% of a true Facets-parity Core Admin OS.**

The *engine spine* is real and trustworthy. The *operational surface area* around it (persistence, integrations, workflows, security, ops) is almost entirely missing.

### What's production-grade ✅
| Area | Status | Notes |
|---|---|---|
| Adjudication math | Solid | Integer cents, deterministic, tested |
| COB primacy | Solid | Birthday/Gender/Custodial + secondary allocation |
| Trace / replayability | Solid | Structured, hashable, explainable |
| State machine | Solid | Guards enforced, visualized |
| Case retro-recalc | Solid | Diff engine works; demo data needs richer baseline |

### What's stubbed or demo-only ⚠️
| Area | Gap |
|---|---|
| Data persistence | Everything is in-memory; no DB, no audit log table |
| Demo scenarios | 3 hand-crafted claims; no volume, no edge-case fuzzing |
| Prior-payer outcomes | Hard-coded; no real 835/EOB parser |
| Member accumulators | Static snapshot; not time-bounded by plan year |
| Retro diff demo | Baseline accumulators are post-state, so demo diff = $0 (math is correct, demo data needs adjustment) |

### What's entirely missing ❌
The big rocks for "full product":

1. **Persistence layer** — Lovable Cloud / Postgres for Claims, Runs, Traces, Cases, Events, Audit Log. Today nothing survives a refresh.
2. **Coverage Graph** — DAG of member coverage spans with confidence scores, verification metadata, primacy edges. Currently a flat `MemberAccumulators` object.
3. **Migration Cockpit** — Legacy_Paid vs DualPay_Paid discrepancy detector, variance > $0.01 flagging, drilldown. Critical for any real cutover.
4. **Communication Log & Case Events surface** — schema exists; no inbound/outbound channels, no templating, no SLA timers.
5. **Provider/Member/Payer master data** — no CRUD, no eligibility verification (270/271), no provider directory.
6. **EDI ingestion** — 837 inbound, 835 outbound, 270/271, 276/277. Today claims are TypeScript objects.
7. **Pricing & contracts engine** — fee schedules, capitation, bundled payments, RBRVS, DRG grouper. Today `ContractTerms` is a flat object.
8. **Edits & audits** — NCCI, MUE, CCI, medical-necessity, prior-auth checks. None present.
9. **Payments** — check/EFT generation, 835 remit, void/reissue, escheatment. None present.
10. **AuthN/AuthZ** — no users, no roles, no row-level security, no audit-of-audit. Mandatory before any PHI touches the system.
11. **Workflow / Work queues** — no assignment, no SLAs, no inventory aging, no team dashboards.
12. **Reporting & BI** — no denial analytics, no payer scorecards, no operational KPIs beyond the stats bar.
13. **Member/Provider portals** — the "self-service resolution" north-star outcome has no front door.
14. **Observability** — no metrics, no tracing infra (the code-level Trace ≠ ops tracing), no SLOs.
15. **Compliance** — HIPAA controls, encryption-at-rest/in-transit posture, BAA-ready logging, retention policies.

### Roadmap to "full product"

```text
Phase 1 — Foundation (now → +4 wks)
  • Enable Lovable Cloud, persist Claims/Runs/Traces/Cases/Events
  • AuthN + role-based AuthZ + audit log
  • Coverage Graph (replace flat accumulators)
  • Migration Cockpit (legacy diff)

Phase 2 — Integrations (+4 → +12 wks)
  • 837 ingestion, 835 emission, 270/271 eligibility
  • Real prior-payer outcome parser
  • Pricing & contracts engine v1 (fee schedule + RBRVS)
  • Edits library v1 (NCCI/MUE)

Phase 3 — Operations (+12 → +20 wks)
  • Work queues, SLAs, assignment, aging
  • Payments (check/EFT + 835 remit)
  • Communication Log channels (email, secure msg)
  • Reporting & denial analytics

Phase 4 — Self-Service (+20 → +28 wks)
  • Member portal: EOB explainer, claim status, COB attestation
  • Provider portal: claim submit, status, remit download
  • Observability + SLOs + compliance hardening
```

### Bottom line

DualPay today is a **trustworthy adjudication kernel with an inspector UI**. It proves the hard part — that the math, COB, state, and retro logic are correct and explainable. To become a deployable Core Admin OS, the next dollar of work should go to **Lovable Cloud persistence + AuthN + Coverage Graph + Migration Cockpit**, in that order. Everything else builds on those four.
