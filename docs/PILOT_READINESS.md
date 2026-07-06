# PILOT_READINESS

## Pilot flow checklist
- [x] Denied claim can be opened in `Recover Denied Claim`.
- [x] Canonical lifecycle state persists in `appeal_recovery_cases`.
- [x] Packet generation updates canonical state to `packet_ready`.
- [x] Review request updates canonical state to `review_requested`.
- [x] Core decision stores trace/outcome/dispatch and advances lifecycle.
- [x] Glue workflow launch stores `glue_run_id` and updates lifecycle.
- [x] Submission path is explicitly manual and non-transmitting.
- [x] Payer response and final outcomes (`recovered`, `lost`, `written_off`) are tracked.
- [x] Viewer role is write-gated in guided flow and work drawer.

## Known manual steps
- Appeal packet delivery to payer is manual (portal/fax/mail).
- Core decision input values are operator-entered during pilot.
- Glue workflow run ID is operator-provided during pilot.

## Known limitations
- Legacy dashboards still read historical `ops_events` for timeline/audit context.
- `claim_assignments` legacy schema remains in place; pilot flow reads/writes `assigned_to_user_id`.
- Existing claim primary key model remains global; pilot lifecycle operations are org+claim scoped in active flow paths.

## Go/No-Go status
- **Status:** GO (pilot path enabled for one canonical denied-claim recovery workflow).
- **Condition:** Requires successful lint/test/build in deployment environment and Supabase migration application.
