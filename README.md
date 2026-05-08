# DualPay

**A deterministic, auditable health-insurance claim adjudication kernel — built for COB-heavy multi-payer scenarios where every cent must be explainable.**

---

## The Problem

Health-plan core admin systems treat adjudication as a black box: claims go in, dollars come out, and when a member or provider disputes an EOB nobody on the operations floor can reconstruct *why* the math landed where it did. COB cases compound the pain — primary/secondary primacy gets misapplied, accumulators drift, retro-adjustments cascade silently across linked claims, and call centers spend hours stitching together explanations from PDFs and tribal knowledge. The cost is denials, rework, regulatory exposure, and member trust.

---

## Solution

DualPay is an adjudication engine with an inspector UI on top. Every claim run produces a structured, hashable trace — every input, rule fired, branch taken, and dollar movement is recorded — so any outcome can be replayed, diffed, and explained in plain language. Multi-payer COB primacy, session accumulators, and retro-recalculation across linked cases are first-class. Math is integer-cents and deterministic; the same inputs always produce the same trace.

---

## Key Capabilities

| Capability | What It Actually Does | Status |
|---|---|---|
| **Adjudication Engine** | Allowed → deductible → copay → coinsurance → OOP-cap waterfall in integer cents, idempotent per `run_id` | `Stable` |
| **COB / Multi-Payer** | Birthday/Gender/Custodial primacy + secondary allocation (lower-of, COB savings, non-duplication) | `Stable` |
| **Trace & Explainability** | Structured `TraceObject` per run with human-readable explanation generator | `Stable` |
| **State Machine** | 16 explicit transitions with guards (`REQUIRE_PRIMACY_CONFIRMATION`, `REQUIRE_IDEMPOTENCY_KEY`) + visual diagram | `Stable` |
| **Case Management** | N-claim → 1-case linking, cross-claim accumulator rollup, retro-recalc with field-level diff viewer | `Stable` |
| **Persistence** | Claims, runs, traces, cases, events, accumulators stored in Lovable Cloud (Postgres) with RLS | `Beta` |
| **Coverage Graph (DAG)** | Member coverage spans with confidence + primacy edges | `Planned` |
| **Migration Cockpit** | Legacy_Paid vs DualPay_Paid discrepancy detector, variance > $0.01 flagging | `Planned` |
| **AuthN / RBAC + Audit Log** | Role-based access, HIPAA-grade audit trail | `Planned` |
| **EDI Ingestion** (837/835/270/271) | Real payer integration | `Planned` |

> `Stable` = production-ready · `Beta` = functional, API may shift · `Planned` = committed, not started

---

## Architecture

```
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
                │
                ▼
         Lovable Cloud (Postgres)
```

**Decisions worth understanding:**

| Decision | Why | What I ruled out |
|---|---|---|
| Integer-cents math throughout | No float drift, byte-exact reproducibility across runs | JS `number` floats, `Decimal` libs (overkill for cents) |
| Pure engine functions, persistence at the edge | Engine is replayable and unit-testable without a DB | Mixing repository calls into adjudication logic |
| Structured `TraceObject` (not log lines) | Hashable, diffable, machine-replayable | Free-text logs, OpenTelemetry spans (wrong abstraction for business audit) |
| Lovable Cloud (managed Postgres) | Zero-infra persistence with RLS built in | Self-hosted Postgres, in-memory only |
| `JSONB` payloads alongside indexed columns | Schema flexibility for evolving claim/trace shapes without migrations per change | Strict normalized schema, document DB |

---

## Stack

| Layer | Choice |
|---|---|
| **UI** | React 18 + TypeScript 5 |
| **Styling** | Tailwind CSS v3 + shadcn-ui |
| **Build** | Vite 5 |
| **Backend** | Lovable Cloud (managed Postgres + Auth + Storage) |
| **Database** | PostgreSQL with Row-Level Security |
| **Testing** | Vitest |

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | `>= 20 LTS` |
| npm or bun | latest |

### Local Setup

```bash
# Install
npm ci

# Start dev server
npm run dev
```

Open `http://localhost:5173`. Lovable Cloud (Postgres) is provisioned automatically — no local Docker required. On first run, the app seeds 3 demo claims, accumulators, and a linked case.

---

## Configuration

Environment variables are managed automatically by Lovable Cloud and written to `.env`. Do not edit `.env` by hand.

| Variable | Source | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | auto | Lovable Cloud Postgres URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | auto | Public anon key |
| `VITE_SUPABASE_PROJECT_ID` | auto | Project ref |

---

## Usage

Open the dashboard at `/`. The left rail lists claims; selecting one opens the adjudication panel with:

- **Trace viewer** — every rule fired, in order, with dollar deltas
- **State diagram** — current claim status with live guard evaluation
- **Case panel** — linked claims, accumulator rollup, retro-recalc with diff viewer

All state survives refresh (persisted to Lovable Cloud).

---

## Testing

```bash
npm run test       # Vitest — engine + COB + state machine
```

Engine tests cover multi-payer scenarios (deductible + coinsurance, COB primacy, secondary allocation) and must pass before any UI work.

---

## Roadmap

| Phase | What | Status |
|---|---|---|
| **Phase 1** | Persistence (done), AuthN + RBAC + Audit Log, Coverage Graph DAG, Migration Cockpit | 🟡 In progress |
| **Phase 2** | EDI ingestion (837/835/270/271), real prior-payer parser, pricing & contracts engine, NCCI/MUE edits | 🔵 Planned |
| **Phase 3** | Work queues, SLAs, payments (check/EFT + 835 remit), denial analytics | 🔵 Planned |
| **Phase 4** | Member + provider portals, observability, HIPAA compliance hardening | 🔵 Planned |

**Honest completeness vs. a full Facets-parity Core Admin OS: ~30%.** The engine spine is real and trustworthy. The operational surface area (integrations, workflows, security, ops) is the next several phases of work.

---

## Operational Context

DualPay was designed for environments where:
- auditability is non-negotiable (regulator and member-facing)
- workflows cross multiple payers and span weeks
- operators need explainable outcomes, not black-box decisions
- retro-adjustments and reversals create cascading financial risk

## System Philosophy

This project prioritizes:
- deterministic workflows over opaque automation
- explainability over magic
- operational visibility over hidden state
- replayability over forensic reconstruction
