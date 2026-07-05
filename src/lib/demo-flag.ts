/**
 * Demo-data gating (Phase 12 + Revenue Readiness sprint hardening).
 *
 * Demo seed scenarios ONLY run when `VITE_DEMO_MODE=true` is explicitly set.
 *
 * DEV mode no longer auto-enables seeding — this prevents accidental data
 * writes / wipes in production-mirrored environments and against real orgs.
 */
export function isDemoModeEnabled(): boolean {
  return String(import.meta.env.VITE_DEMO_MODE).toLowerCase() === 'true';
}
