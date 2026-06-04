/**
 * Demo-data gating (Phase 12).
 *
 * Demo seed scenarios only run when:
 *   - running in Vite dev mode, OR
 *   - VITE_DEMO_MODE is explicitly set to "true"
 *
 * Production authenticated orgs never receive auto-seeded demo claims.
 */
export function isDemoModeEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  return String(import.meta.env.VITE_DEMO_MODE).toLowerCase() === 'true';
}
