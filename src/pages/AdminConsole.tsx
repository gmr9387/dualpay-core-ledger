import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { RequireRole } from '@/components/auth/RequireRole';
import { Shield, ScrollText, Database, Users, FileDown } from 'lucide-react';

interface Kpis {
  members: number;
  orgs: number;
  auditEvents: number;
  exports: number;
  storageDocs: number;
}

export default function AdminConsole() {
  return (
    <RequireRole min="admin">
      <AdminConsoleInner />
    </RequireRole>
  );
}

function AdminConsoleInner() {
  const { currentOrg } = useOrg();
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    (async () => {
      const [m, o, e, x, d] = await Promise.all([
        supabase.from('organization_members').select('*', { count: 'exact', head: true }).eq('org_id', currentOrg.org_id),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('ops_events').select('*', { count: 'exact', head: true }).eq('org_id', currentOrg.org_id),
        supabase.from('ops_events').select('*', { count: 'exact', head: true }).eq('org_id', currentOrg.org_id).eq('kind', 'audit_export_completed'),
        supabase.from('evidence_documents').select('*', { count: 'exact', head: true }).eq('org_id', currentOrg.org_id),
      ]);
      setKpis({
        members: m.count ?? 0,
        orgs: o.count ?? 0,
        auditEvents: e.count ?? 0,
        exports: x.count ?? 0,
        storageDocs: d.count ?? 0,
      });
    })();
  }, [currentOrg]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <p className="text-sm text-muted-foreground">Tenancy, security, and audit oversight for {currentOrg?.name}.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Active members" value={kpis?.members ?? '—'} />
        <Kpi icon={<Database className="h-4 w-4" />} label="Organizations" value={kpis?.orgs ?? '—'} />
        <Kpi icon={<ScrollText className="h-4 w-4" />} label="Audit events" value={kpis?.auditEvents ?? '—'} />
        <Kpi icon={<FileDown className="h-4 w-4" />} label="Exports run" value={kpis?.exports ?? '—'} />
        <Kpi icon={<Shield className="h-4 w-4" />} label="Stored documents" value={kpis?.storageDocs ?? '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Security Inventory</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-muted-foreground">Inspect Row Level Security policies, helper functions, and role scope.</p>
            <Link className="text-primary underline" to="/admin/security">Open security inventory →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Audit Export</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-muted-foreground">Export ops events, escalations, assignments, outcomes, and evidence activity. Full or PHI-redacted.</p>
            <Link className="text-primary underline" to="/admin/audit">Open audit export →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">{icon}{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
