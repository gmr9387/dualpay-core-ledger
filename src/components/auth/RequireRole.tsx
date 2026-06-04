import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrg, type OrgRole } from '@/hooks/use-org';
import { roleAtLeast } from '@/lib/role-permissions';

export function RequireRole({ min, children }: { min: OrgRole; children: ReactNode }) {
  const { currentOrg, loading } = useOrg();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!currentOrg) return <Navigate to="/" replace />;
  if (!roleAtLeast(currentOrg.role, min)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold mb-2">Access restricted</h1>
        <p className="text-sm text-muted-foreground">
          This area requires the <span className="font-medium">{min}</span> role or higher.
          You are currently signed in as <span className="font-medium">{currentOrg.role}</span>.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
