# DualPay — Incident Response Plan

**Document owner:** Security & Compliance
**Audience:** Engineering, Security & Compliance, Executive, Customer Success; auditors (SOC 2, HIPAA); customer security reviewers
**Status:** Internal working draft — reflects current implementation as of this revision
**Companions:** [`SECURITY.md`](./SECURITY.md), [`HIPAA_OVERVIEW.md`](./HIPAA_OVERVIEW.md), [`ACCESS_CONTROL_POLICY.md`](./ACCESS_CONTROL_POLICY.md), [`RISK_REGISTER.md`](./RISK_REGISTER.md), [`DATA_CLASSIFICATION.md`](./DATA_CLASSIFICATION.md)

Each control below is tagged **Implemented**, **Partially Implemented**, or **Planned**. Nothing is claimed that cannot be traced to a table, function, edge function, or code file in the repo.

---

## 1. Purpose

Establish a repeatable process for detecting, containing, investigating, eradicating, recovering from, and reporting security and privacy incidents affecting DualPay — a multi-tenant SaaS platform processing PHI under HIPAA §160.103.

This plan operationalises:

- HIPAA §164.308(a)(6) Security Incident Procedures.
- HIPAA §164.400–414 Breach Notification Rule.
- SOC 2 Trust Services Criteria **CC7.3** (evaluate security events), **CC7.4** (respond to identified events), **CC7.5** (recovery from identified events).

## 2. Scope

Applies to any confirmed or suspected event that affects the confidentiality, integrity, or availability of DualPay data, code, or infrastructure — including:

- Unauthorised access to `public.*` tables or the `evidence-documents` / `appeal-packets` storage buckets.
- Compromise of an `owner`, `admin`, `manager`, `analyst`, or `service_role` identity.
- Data exposure via `ops_events`, `traces`, edge-function logs, or exports.
- Availability incidents in the managed Postgres, Auth, Storage, or Edge Functions plane.
- Malicious or accidental data alteration (tampering with `claims`, `remittance_lines`, `traces`, `replay_ledger_events`, etc.).
- Vulnerabilities disclosed by researchers under §3 of `SECURITY.md`.

Out of scope: incidents entirely contained within a customer's own environment that do not touch DualPay's data plane — those are triaged and referred back to the customer.

---

## 3. Incident Severity Levels

**Implemented — classification rubric:**

| Severity | Trigger | Response SLA (target) | Examples |
|---|---|---|---|
| **P1 — Critical** | Confirmed PHI exposure to unauthorised party; cross-tenant data leak; production auth bypass; ransomware or destructive attack; total production outage. | Ack **≤ 15 min**, containment **≤ 1 hr**, executive notification **≤ 1 hr**, customer notification **≤ 24 hr** for PHI, HHS notification path evaluated **≤ 60 days**. | RLS bypass leaking another org's `claims`; `service_role` key leak; deletion of `traces` / `replay_ledger_events`. |
| **P2 — High** | Suspected PHI exposure, unresolved auth/RLS anomaly, privileged-account compromise, partial outage of a PHI-touching surface. | Ack **≤ 1 hr**, containment **≤ 4 hr**, executive notification **≤ 4 hr**. | Anomalous mass read from a single actor; failed integrity check on `traces`; storage signed-URL leaked in logs. |
| **P3 — Medium** | Security-relevant misconfiguration with no confirmed exposure; policy violation without PHI touch; single-tenant availability degradation. | Ack **≤ 1 business day**, remediation ETA **≤ 5 business days**. | `EXECUTE` grant found wider than intended on a helper function; `ops_events.summary` observed to contain a near-PHI token; contractor left without membership removal. |
| **P4 — Low** | Best-practice deviation; scanner warning without exploitability; documentation drift. | Ack **≤ 3 business days**, remediation ETA **≤ 30 days**. | Linter warning on a new migration; missing GRANT documentation; stale test fixtures. |

Classification is set by the Incident Commander (see §4) and may be **upgraded at any time** as new information arrives. Downgrade requires written sign-off from the Security & Compliance owner.

---

## 4. Incident Response Team

**Partially Implemented** — roles are defined; formal on-call rotation is **Planned**.

| Role | Owner (today) | Responsibilities |
|---|---|---|
| **Incident Commander (IC)** | Security & Compliance lead (rotating during business hours) | Owns the incident end-to-end; declares severity; coordinates all workstreams; single decision-maker for containment. |
| **Deputy IC / Scribe** | Engineering on-call | Maintains the incident timeline in the incident channel; captures decisions and artefacts. |
| **Engineering Lead** | CTO or delegated senior engineer | Drives technical investigation, containment, and recovery. |
| **Data / Forensics** | Senior engineer familiar with `ops_events` / `traces` / `replay_ledger_events` | Preserves evidence; reconstructs timelines from audit surfaces. |
| **Communications Lead** | Customer Success + Executive | Drafts internal, customer, and (for PHI breaches) regulatory notifications. |
| **Legal / Privacy** | External counsel (retainer) | HIPAA Breach Notification Rule interpretation; BAA obligations; regulator engagement. |
| **Executive Sponsor** | CEO | P1/P2 approval for external notification; customer-executive escalation. |

**Planned**

- Formal 24×7 on-call rotation with paging (PagerDuty or equivalent).
- Backup / secondary for every role above.
- Annual tabletop exercise with named participants.

---

## 5. Detection & Reporting

**Implemented — signals available today:**

- **Application audit stream** `public.ops_events` — every meaningful mutation is journaled via `appendOpsEvent` (`src/lib/ops-events.ts`) with real actor identity (`actor_user_id`, `actor_email`, `actor_name`). Kinds relevant to detection include `assignment_changed`, `document_uploaded/updated/removed`, `appeal_packet_generated`, `audit_export_requested/completed`, `job_failed`, `job_dead_lettered`, `stalled_job_recovered`, `worker_registered/heartbeat`, `edi_rejected`, `lineage_missing`.
- **Deterministic trace log** `public.traces` — SHA-256 fingerprinted; integrity verified by `src/engine/trace-verifier.ts`. Fingerprint mismatch = tamper signal.
- **Immutable replay ledger** `public.replay_ledger_events` + `public.replay_records` — append-only; hash-chained.
- **Job telemetry** `public.job_runs`, `public.job_failures`, `public.scheduler_runs`, `public.worker_registry` — reveal worker crashes, stalled runs, and heartbeat gaps.
- **Platform Auth log** (managed) — sign-in, MFA challenge, password reset.
- **Edge-function logs** (`invite-member`, `scheduler-dispatcher`, `worker-dispatcher`).
- **Customer / researcher reports** via `security@dualpay.example` — see `SECURITY.md` §2–§3.
- **UI surfaces:** `AdminAudit`, `AdminSecurity`, `TransparencyCenter`, `PlatformFailures`, `PlatformJobs`, `PlatformWorkers`, `AuditTrace`.

**Reporting paths — Implemented:**

- **Internal reporter** — any employee: post in the internal incident channel or email `security@dualpay.example`. No retaliation policy is in force.
- **External reporter (researcher / customer)** — `security@dualpay.example`. Acknowledgment SLA ≤ 1 business day (see `SECURITY.md` §2).
- **Automated signal** — engineer investigating a `PlatformFailures` spike, `trace-verifier` mismatch, or unusual `ops_events` pattern must open an incident.

**Partially Implemented**

- Detection is human-driven — no automated alerting on suspicious `ops_events` sequences (mass export, mass delete, cross-role escalation) yet.

**Planned**

- SIEM forwarding (Datadog / Splunk / Elastic).
- Alert rules: > N `audit_export_requested` per actor per hour; any `DELETE` on `traces`/`replay_*`; `service_role` calls from unexpected origins; `document_removed` above baseline.
- Status page for customer-visible availability incidents.
- Public `/.well-known/security.txt` at the marketing origin.
- Encrypted intake channel (PGP key for `security@`).

---

## 6. Containment Procedures

Containment must precede investigation depth. Order of operations:

**Implemented**

1. **Declare the incident** — IC opens a dedicated channel, sets severity, starts the timeline.
2. **Revoke suspected identities:**
   - Human account: `owner`/`admin` removes the row from `public.organization_members` (RLS-gated).
   - Force sign-out at the managed Auth layer.
   - Rotate the affected user's password reset token if abuse continues.
3. **Contain `service_role` compromise:**
   - Rotate platform API keys (Lovable Cloud → managed rotation).
   - Redeploy the three edge functions (`invite-member`, `scheduler-dispatcher`, `worker-dispatcher`) so they pick up the new key.
4. **Freeze a tenant** (P1/P2 only) — coordinated with Executive Sponsor:
   - `owner`/`admin` demotes non-essential members; retains only the IC-designated investigator seat.
   - Storage: rely on signed-URL TTL expiring; existing URLs are not retroactively revoked (see §7 of `ACCESS_CONTROL_POLICY.md`).
5. **Snapshot audit surfaces** for forensics before further action:
   - Export the relevant `ops_events` slice (`kind`, `actor_user_id`, `claim_id`, `occurred_at` window).
   - Export the `traces` and `replay_ledger_events` slices covering the affected claims.
6. **Preserve object storage** — do not delete suspected objects; mark them out-of-band for hold.
7. **Kill in-flight jobs** if a compromised worker is executing — via `job_queue` status updates by an authorised admin; `recover_stalled_queue_jobs` will re-queue safe work.

**Partially Implemented**

- Tenant "freeze" is procedural today; there is no single-switch tenant lockout. Removing member rows is the mechanism.
- Signed-URL revocation is bounded by TTL, not immediate.

**Planned**

- One-click tenant freeze (a single flag on `organizations` gating a top-level RLS predicate).
- Immediate signed-URL revocation by object-key allow-list.
- Automated `service_role` key rotation runbook with post-rotation verification.

---

## 7. Investigation Procedures

**Implemented — evidence sources:**

- **Who** — `ops_events.actor_user_id`, `actor_email`, `actor_name`; membership state at time-T reconstructed from `organization_members` history via `ops_events` `assignment_changed` records.
- **What** — `ops_events.kind`, `payload`, `summary`; correlated `traces` for affected claims; `replay_ledger_events` for any re-run.
- **When** — `ops_events.occurred_at`; `traces.created_at`; job telemetry timestamps.
- **How** — route hit, edge function invocation, or job execution reconstructed by joining `job_runs` / `job_failures` / `worker_registry`.
- **Where** — client-side origin (from Auth log); edge function name; storage bucket + key prefix.

**Investigation checklist (Implemented as convention):**

1. Set a **time window** and a **candidate actor set**.
2. Pull `ops_events` for that window scoped by `actor_user_id` and/or `claim_id`.
3. Verify **trace integrity** for any implicated claims via `src/engine/trace-verifier.ts` — a mismatch is itself a P1 signal.
4. Cross-check `replay_ledger_events` for unexpected replays.
5. Inspect `job_failures` and `job_queue` for anomalous entries; check `worker_registry` heartbeats.
6. For storage incidents: enumerate objects under the affected `org_id/…` prefix; confirm no cross-prefix objects exist.
7. Identify **root cause category**: identity compromise, RLS gap, application bug, misconfiguration, third-party.
8. Estimate **blast radius**: which orgs, which claims, how many members, which PHI elements.

**Partially Implemented**

- Investigations are executed with SQL + application queries; there is no purpose-built forensics UI beyond `AdminAudit` / `TransparencyCenter` / `LineageClaim`.

**Planned**

- Case-per-incident record (dedicated table or reuse `cases` with a `security_incident` kind) with structured fields for scope, evidence links, and decisions.
- Automated blast-radius query pack.
- Timeline export to a signed, hashed bundle (mirrors the "Explanation Bundle" pattern).

---

## 8. Eradication & Recovery

**Implemented**

- **Fix the class, not the instance.** For an RLS/authorisation finding, enumerate every sibling table/route sharing the same assumption and remediate in the same change.
- **Ship the fix behind a migration** when the root cause is schema/policy/function-shaped — this preserves reproducibility across environments.
- **Regenerate types** (`src/integrations/supabase/types.ts`) after schema changes.
- **Verify with the fastest relevant check** — targeted tests (`src/test/*.test.ts`), console/network inspection, RLS spot-check via `psql` for a second-tenant JWT, trace re-verification.
- **Re-enable access** only after: (a) fix verified in production, (b) IC sign-off, (c) audit-log entry written (`ops_events` with the remediation summary).
- **Recovery of data** — Postgres point-in-time recovery is available at the managed platform layer; storage objects are versioned by the object store.

**Partially Implemented**

- Formal RTO/RPO targets are documented as **Planned** in `SECURITY.md` §10; today, recovery relies on managed-platform defaults.
- Post-fix regression coverage exists for high-risk logic (calculation engine, state machine, replay, idempotency, assignments) but not comprehensive RLS regression.

**Planned**

- Documented **RTO 4 hours / RPO 1 hour** with quarterly restore rehearsal and signed evidence.
- RLS regression suite covering every table for a second-tenant JWT.
- Automated post-fix verification checklist enforced in CI.
- Hotfix branch playbook (fast-forward + backfill of missed CI signals).

---

## 9. PHI Breach Handling

DualPay processes PHI (see `DATA_CLASSIFICATION.md` §1). Any incident with actual or suspected unauthorised access to PHI follows a HIPAA-specific overlay on the general flow.

**Implemented — decision framework (aligned with 45 CFR §164.402):**

1. **Was PHI accessed, acquired, used, or disclosed in a manner not permitted by the Privacy Rule?** If unclear, presume yes and proceed with the risk assessment.
2. **Four-factor risk assessment** (§164.402(2)):
   - Nature and extent of the PHI (identifiers, sensitivity, likelihood of re-identification).
   - Unauthorised person who used it / to whom disclosed.
   - Whether PHI was actually acquired or viewed.
   - Extent to which risk has been mitigated.
3. **Presumption of breach** unless there is a low probability of compromise, documented and signed off by Security & Compliance + Legal.
4. **BAA obligations** to the affected covered-entity customer are triggered — DualPay is a Business Associate.

**Evidence used (all Implemented):**

- `ops_events` slice by actor and time window (who accessed what).
- `traces` for the affected claims (what data existed at time-of-access; SHA-256 verified).
- Storage access records for `evidence-documents` / `appeal-packets` where available at the platform layer.
- `remittance_lines`, `edi_transactions`, `claims`, `member_accumulators` row counts by `org_id` (blast-radius sizing).

**Partially Implemented**

- Storage-level object-access logs rely on the managed platform's audit facility; they are not mirrored into `ops_events` today.

**Planned**

- Standing legal counsel engagement letter for HIPAA breach response.
- Pre-drafted individual, media, and HHS notification templates approved by counsel (see §11).
- Post-incident "PHI touched" query pack that produces the affected-individuals list in a signed export.
- Column-encryption of `member_id` and envelope-encryption of raw EDI payloads — reduces breach magnitude when triggered (from `SECURITY.md` §7.3).

---

## 10. Customer Notification Process

**Partially Implemented**

- **P1 with confirmed or presumed PHI exposure:** affected customer Owners notified **within 24 hours** of confirmation, in writing, with: (a) what happened, (b) what data was involved, (c) what DualPay has done, (d) what the customer should do, (e) point of contact.
- **P1/P2 without PHI touch:** affected customers notified within 3 business days once containment is verified.
- **P3/P4:** disclosed in the next scheduled security update (quarterly) unless customer-specific.
- Notification medium today: direct email to the tenant Owner on file, plus a follow-up in-product notice if the tenant is active. Delivery is manual (Customer Success + IC).
- All customer notifications are logged as `ops_events` (`kind='audit_export_completed'` with `payload.type='breach_notification'` until a dedicated kind is added — see §15 of `ACCESS_CONTROL_POLICY.md` on the parallel item for policy exceptions).

**Implemented — content requirements** (mirrors HIPAA §164.404(c) for individual notice, adapted for BA→CE communication):

1. Brief description of what happened, including dates.
2. Types of PHI involved (e.g., patient identifiers, EDI 837/835 payloads, evidence documents).
3. Steps individuals may take to protect themselves (customer-facing when applicable).
4. What DualPay is doing to investigate, mitigate, and prevent recurrence.
5. Contact procedures — email + named IC.

**Planned**

- Public status page for availability incidents.
- Templated notification workflow (draft → Legal review → Executive sign-off → send → log) with per-step audit.
- Post-incident customer webinar for P1 events.

---

## 11. Regulatory Notification Considerations

DualPay operates as a HIPAA Business Associate. Regulatory obligations flow through the covered-entity customer, with DualPay providing the underlying facts and support.

**Implemented — reference framework only; execution is Legal-led:**

- **HIPAA Breach Notification Rule (45 CFR §§164.400–414):**
  - **Business Associate → Covered Entity:** notify without unreasonable delay and **no later than 60 days** after discovery (§164.410).
  - **Covered Entity → Individuals:** no later than **60 days** after discovery (§164.404).
  - **Covered Entity → HHS Secretary:** contemporaneously with individuals if ≥ **500 individuals**; annual log otherwise (§164.408).
  - **Covered Entity → Prominent Media:** required if ≥ **500 residents of a state or jurisdiction** are affected (§164.406).
- **State breach-notification laws:** vary by state; may impose stricter timelines and content requirements. Legal determines applicability based on affected-individuals residency.
- **HHS OCR investigations:** DualPay cooperates fully as a Business Associate; evidence bundles produced from `ops_events` + `traces` + configuration snapshots.

**Partially Implemented**

- We can produce the factual evidence bundle any time; templated legal communications are **Planned**.

**Planned**

- Pre-drafted counsel-approved notification packet.
- State-by-state applicability matrix maintained by Legal.
- Documented process for supporting a customer's HHS filing.

---

## 12. Evidence Preservation

**Implemented**

- `public.ops_events` is **append-only** (`clearOpsEvents` in `src/lib/ops-events.ts` is intentionally a no-op).
- `public.traces` are append-only and SHA-256 fingerprinted; `src/engine/trace-verifier.ts` detects tamper.
- `public.replay_ledger_events` and `public.replay_records` are immutable with integrity hashes.
- Postgres point-in-time recovery preserves state at any moment within the platform's retention window.
- Storage objects are versioned by the object store.
- Migrations under `supabase/migrations/*.sql` are the reproducible source of truth for schema/policy state at any historical timestamp.

**Chain-of-custody rules (Implemented as convention):**

1. IC opens the incident channel; every artefact link is posted there with a timestamp.
2. Evidence exports (SQL slice, storage object list, log excerpts) are stored under an incident-specific path in `evidence-documents` (private) or an equivalent internal share; the export event is logged to `ops_events`.
3. Screenshots and derived artefacts are annotated with (a) source, (b) time captured, (c) capturing engineer's identity.
4. No destructive analysis on the sole copy — always work on a copy; the primary evidence is left untouched.

**Partially Implemented**

- 6-year audit retention is documented as a target (see `DATA_CLASSIFICATION.md`, `SECURITY.md` §8). Current retention is indefinite by default; a scheduled purge job is **Planned**.

**Planned**

- Dedicated incident evidence bucket with WORM (write-once-read-many) semantics.
- Signed, hashed evidence bundles (mirrors the "Explanation Bundle" pattern in `mem://features/regulatory-reporting`).
- Legal-hold flag that suspends any retention purge for named claims/orgs.

---

## 13. Postmortem Process

**Partially Implemented**

- Every P1 and P2 receives a **blameless postmortem** within **10 business days** of resolution.
- P3 receives a lightweight write-up in the next weekly ops review.
- P4 is captured as a `RISK_REGISTER.md` entry only.

**Postmortem template (Implemented — content requirements):**

1. **Summary** — 3 sentences: what happened, impact, resolution.
2. **Timeline** — reconstructed from `ops_events`, incident channel, and job telemetry; time-stamped.
3. **Impact** — orgs affected, claims touched, PHI classification, downtime, financial impact if any.
4. **Root cause** — category (identity, RLS, code bug, config, third-party) + specific technical explanation.
5. **What went well.**
6. **What went poorly.**
7. **Where we got lucky.**
8. **Action items** — each with owner, due date, and severity; land in `RISK_REGISTER.md`.
9. **Detection gap analysis** — could we have caught this earlier? What signal is missing?
10. **Prevention gap analysis** — is the fix specific or class-wide (see §8)?

**Distribution:**

- All-hands internal.
- Redacted, customer-friendly version for any tenant impacted (P1/P2).
- Redacted anonymised summary for the annual security posture publication (**Planned**).

**Planned**

- Postmortems tracked in a first-class table with links to `ops_events` slices and action-item completion status.
- Quarterly review of postmortem action-item close rate — a lagging quality indicator.

---

## 14. Incident Metrics

**Implemented (compute on demand from `ops_events` + incident channel):**

- **Count of incidents by severity** per month/quarter.
- **Mean Time To Detect (MTTD)** — first evidence timestamp → incident declared.
- **Mean Time To Acknowledge (MTTA)** — reporter contact → IC ack.
- **Mean Time To Contain (MTTC)** — declared → containment verified.
- **Mean Time To Recover (MTTR)** — declared → full restoration.
- **Reopen rate** — incidents that reoccurred within 30 days.
- **Postmortem action-item close rate** at 30/60/90 days.

**Partially Implemented**

- Metrics are computed manually for now — no dashboard.

**Planned**

- Incident metrics dashboard in `AdminAudit` or a dedicated `SecurityOps` route.
- Monthly executive report bundling metrics + open action items + risk register delta.
- SLA burn tracking against §3 severity targets.

---

## 15. Testing & Review Process

**Partially Implemented**

- This plan is reviewed **at least annually** and after any P1 incident.
- The `RISK_REGISTER.md` is reviewed **quarterly**.
- Signal integrity is exercised continuously: `trace-verifier` runs on every calculation; replay tests (`src/test/replay-ledger.test.ts`, `src/test/replay-store.test.ts`) exercise the immutable ledger.
- Access-revocation runbook (§7 of `ACCESS_CONTROL_POLICY.md`) is exercised whenever a member is offboarded.

**Planned — testing cadence:**

| Exercise | Frequency | Scope |
|---|---|---|
| **Tabletop** (paper walkthrough of a P1 scenario) | Semi-annually | Full IRT; scenarios rotated: cross-tenant RLS leak, `service_role` key leak, ransomware, mass export abuse, malicious insider. |
| **Live drill** (against a staging environment) | Annually | Detection → containment → notification-draft path; measured against §14 metrics. |
| **Restore rehearsal** (Postgres PITR + storage version restore) | Quarterly | Documented RTO/RPO validated; report filed. |
| **RLS regression** (multi-tenant JWT harness) | Every migration touching `public` | CI-enforced. |
| **Access review** | Quarterly (per tenant) + Monthly (internal) | See `ACCESS_CONTROL_POLICY.md` §8. |
| **Plan review** | Annually + after every P1 | Update severity rubric, roster, playbooks. |

**Planned enablers:**

- Named participants and scoring rubric for each drill.
- Post-drill action items land in `RISK_REGISTER.md`.
- Public annual security posture summary (redacted) once SOC 2 Type I is achieved.

---

## Appendix A — Quick-Reference Playbook by Incident Type

| Incident type | First 3 actions (Implemented) | Owner |
|---|---|---|
| **Cross-tenant read via RLS gap** | (1) Identify affected tables + orgs; (2) disable the offending route/query and ship a policy fix in a migration; (3) snapshot `ops_events` + `traces` for the exposure window. | Engineering Lead + IC |
| **`service_role` key leak** | (1) Rotate platform keys; (2) redeploy the three edge functions; (3) audit `ops_events` for anomalous writes since the leak window. | Engineering Lead |
| **Compromised `admin` / `owner` account** | (1) Remove the row from `organization_members`; (2) force sign-out at the platform; (3) enumerate their `ops_events` in the exposure window. | IC + Engineering Lead |
| **Malicious or accidental data alteration** | (1) Freeze writes on the affected table for the tenant; (2) verify `traces` fingerprints and `replay_ledger_events` chain; (3) restore from PITR to a labelled staging copy for diffing. | Data / Forensics |
| **Storage exposure (`evidence-documents` / `appeal-packets`)** | (1) Enumerate objects under the affected `org_id/…` prefix; (2) let signed-URL TTLs expire and block re-issuance; (3) confirm no root-level uploads bypassed the policy. | Engineering Lead |
| **Mass export abuse** | (1) Suspend the actor's membership; (2) pull every `audit_export_requested/completed` for the window; (3) notify affected Owners. | IC + Communications Lead |
| **Availability outage (managed platform)** | (1) Consult managed platform status; (2) communicate ETA to customers; (3) preserve failed job payloads via `job_failures` for post-recovery replay. | Engineering Lead |
| **Vulnerability disclosure (external researcher)** | (1) Acknowledge per `SECURITY.md` §2 SLA; (2) reproduce in a scratch tenant; (3) triage severity via §3. | IC |

## Appendix B — Traceability Index

| Control | Evidence |
|---|---|
| Append-only audit stream | `public.ops_events`; `src/lib/ops-events.ts` (`clearOpsEvents` is no-op) |
| Trace integrity | `public.traces`; `src/engine/trace-verifier.ts` |
| Immutable replay ledger | `public.replay_ledger_events`, `public.replay_records`; `src/test/replay-ledger.test.ts`, `src/test/replay-store.test.ts` |
| Job & worker telemetry | `public.job_runs`, `public.job_failures`, `public.scheduler_runs`, `public.worker_registry` |
| Membership revocation | `public.organization_members` + RLS; `ACCESS_CONTROL_POLICY.md` §7 |
| Storage isolation | Buckets `evidence-documents`, `appeal-packets`; root-upload block in migration `20260710182913_af0f38ed-e0d7-4219-9dbe-4569d2d806cb.sql` |
| Investigation UI | `src/pages/AdminAudit.tsx`, `AdminSecurity.tsx`, `TransparencyCenter.tsx`, `PlatformFailures.tsx`, `PlatformJobs.tsx`, `PlatformWorkers.tsx`, `AuditTrace.tsx`, `LineageClaim.tsx` |
| Reproducible schema state | `supabase/migrations/*.sql` |

---

*This plan is reviewed at least annually and after every P1 incident. Material changes are recorded via `ops_events` and communicated to tenant Owners under the BAA.*
