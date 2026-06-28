import type { OrgRole } from '@/hooks/use-org';

/** Phase 14 — UI-level role visibility. RLS remains the authoritative gate; this hides controls. */
const ORDER: Record<OrgRole, number> = { viewer: 0, analyst: 1, manager: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: OrgRole | undefined | null, min: OrgRole): boolean {
  if (!role) return false;
  return ORDER[role] >= ORDER[min];
}

export const can = {
  view:           (r: OrgRole | null | undefined) => roleAtLeast(r, 'viewer'),
  upload:         (r: OrgRole | null | undefined) => roleAtLeast(r, 'analyst'),
  edit:           (r: OrgRole | null | undefined) => roleAtLeast(r, 'analyst'),
  assign:         (r: OrgRole | null | undefined) => roleAtLeast(r, 'analyst'),
  escalate:       (r: OrgRole | null | undefined) => roleAtLeast(r, 'manager'),
  delete:         (r: OrgRole | null | undefined) => roleAtLeast(r, 'manager'),
  /** Write-off is a destructive, irreversible action — manager/admin/owner only. */
  writeOff:       (r: OrgRole | null | undefined) => roleAtLeast(r, 'manager'),
  exportAudit:    (r: OrgRole | null | undefined) => roleAtLeast(r, 'manager'),
  exportFull:     (r: OrgRole | null | undefined) => roleAtLeast(r, 'admin'),
  manageOrg:      (r: OrgRole | null | undefined) => roleAtLeast(r, 'admin'),
  manageSecurity: (r: OrgRole | null | undefined) => roleAtLeast(r, 'admin'),
};
