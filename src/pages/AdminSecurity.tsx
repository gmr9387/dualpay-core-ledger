import { RequireRole } from '@/components/auth/RequireRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

/**
 * Phase 14 — Security Inventory
 * Static, code-mirrored inventory of the RLS policy model and SECURITY DEFINER helpers.
 * Mirrors the SQL applied in the Phase 14 migration. Updates here when policies change.
 */

interface PolicyRow { table: string; policy: string; access: 'SELECT'|'INSERT'|'UPDATE'|'DELETE'; roles: string }

const OPERATIONAL_TABLES = [
  'claims','member_accumulators','adjudication_runs','cases','case_claim_links','case_events',
  'traces','ops_events','claim_assignments','recovery_outcomes','import_batches','import_exceptions',
  'field_mappings','remittance_batches','evidence_documents',
];

const POLICIES: PolicyRow[] = OPERATIONAL_TABLES.flatMap(t => ([
  { table: t, policy: `${t}_select`, access: 'SELECT', roles: 'authenticated org member' },
  { table: t, policy: `${t}_insert`, access: 'INSERT', roles: 'analyst+' },
  { table: t, policy: `${t}_update`, access: 'UPDATE', roles: 'analyst+' },
  { table: t, policy: `${t}_delete`, access: 'DELETE', roles: 'manager+' },
] as PolicyRow[]));

const HELPERS = [
  { name: 'is_org_member(_org_id, _user_id)',   purpose: 'Membership check', execute: 'authenticated' },
  { name: 'has_org_role(_org_id, _user_id, _roles)', purpose: 'Role check', execute: 'authenticated' },
  { name: 'current_org_id()',                    purpose: 'Default org resolver for inserts', execute: 'authenticated' },
  { name: 'set_default_org_id()',                purpose: 'BEFORE INSERT trigger', execute: 'table owner (trigger only)' },
  { name: 'handle_new_user_org()',               purpose: 'Auto-provision org on signup', execute: 'table owner (trigger only)' },
];

export default function AdminSecurity() {
  return (
    <RequireRole min="admin">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Security Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Row Level Security policies and SECURITY DEFINER helpers across the operational schema.
            Anonymous access is denied on every operational table. No permissive demo branches remain.
          </p>
        </div>

        <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
          <Badge variant="secondary" className="justify-center py-2">No global access</Badge>
          <Badge variant="secondary" className="justify-center py-2">No anonymous access</Badge>
          <Badge variant="secondary" className="justify-center py-2">No NULL org_id allowed</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">RLS Policies</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Table</TableHead><TableHead>Policy</TableHead><TableHead>Access</TableHead><TableHead>Role Scope</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {POLICIES.map(p => (
                  <TableRow key={p.policy}>
                    <TableCell className="font-mono text-xs">{p.table}</TableCell>
                    <TableCell className="font-mono text-xs">{p.policy}</TableCell>
                    <TableCell><Badge variant="outline">{p.access}</Badge></TableCell>
                    <TableCell className="text-xs">{p.roles}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">SECURITY DEFINER Helpers</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Function</TableHead><TableHead>Purpose</TableHead><TableHead>EXECUTE granted to</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {HELPERS.map(h => (
                  <TableRow key={h.name}>
                    <TableCell className="font-mono text-xs">{h.name}</TableCell>
                    <TableCell className="text-xs">{h.purpose}</TableCell>
                    <TableCell className="text-xs">{h.execute}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
