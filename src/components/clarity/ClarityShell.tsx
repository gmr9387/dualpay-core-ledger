import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, AlertOctagon, ListChecks, FileSearch, Gavel,
  TrendingDown, Building2, Upload, ScrollText, Shield, Search,
  HelpCircle, Bell, User, Database, Activity, Target, FolderOpen, BarChart3,
} from 'lucide-react';

const NAV = [
  { to: '/',          label: 'Command Center',     icon: LayoutDashboard },
  { to: '/today',     label: "Today's Recovery",   icon: Target, badge: 'NEW' },
  { to: '/denials',   label: 'Denial Command',     icon: AlertOctagon, badge: 'PRIME' },
  { to: '/queues',    label: 'Work Queues',         icon: ListChecks },
  { to: '/appeals',   label: 'Appeals Workbench',   icon: Gavel },
  { to: '/evidence',  label: 'Evidence Vault',      icon: FolderOpen },
  { to: '/leak',      label: 'Revenue Leak',        icon: TrendingDown },
  { to: '/payers',    label: 'Payer Intelligence',  icon: Building2 },
  { to: '/reports',   label: 'Executive Reporting', icon: BarChart3 },
  { to: '/claims',    label: 'Claims Workbench',    icon: FileSearch },
  { to: '/ingest',    label: 'Ingestion',           icon: Upload },
  { to: '/audit',     label: 'Audit & Trace',       icon: ScrollText },
];

interface ClarityShellProps {
  children: ReactNode;
  cloudOnline?: boolean;
}

export function ClarityShell({ children, cloudOnline = true }: ClarityShellProps) {
  const { pathname } = useLocation();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-0 text-foreground">
      <aside className="w-60 shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary/15 border border-sidebar-primary/30 flex items-center justify-center">
            <Shield className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-tight">Claim Clarity</div>
            <div className="text-[10px] font-mono text-sidebar-foreground/55">Operations · v3.0</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
            Reimbursement Ops
          </div>
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-mono font-semibold tracking-wider px-1.5 py-0.5 rounded bg-sidebar-primary/20 text-sidebar-primary">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 py-2.5 border-t border-sidebar-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
            <Database className={`h-3 w-3 ${cloudOnline ? 'text-status-paid' : 'text-status-denied'}`} />
            <span className="text-sidebar-foreground/70">Persistence</span>
            <span className={cloudOnline ? 'text-status-paid' : 'text-status-denied'}>
              {cloudOnline ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
            <Activity className="h-3 w-3 text-status-paid" />
            <span className="text-sidebar-foreground/70">Intel Engine</span>
            <span className="text-status-paid">ONLINE</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-4 px-5 border-b bg-card">
          <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                <span className={i === crumbs.length - 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                  {c}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex-1 max-w-md ml-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search claims, denials, payers, members…"
                className="w-full h-8 pl-8 pr-3 text-[12.5px] rounded-md bg-muted/60 border border-transparent focus:bg-card focus:border-input focus:outline-none focus:ring-2 focus:ring-ring/40 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold tracking-wider px-2 py-0.5 rounded border border-status-pending/40 bg-status-pending/10 text-status-pending">
              PROD
            </span>
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
              <HelpCircle className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-status-denied" />
            </button>
            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function breadcrumbsFor(pathname: string): string[] {
  const map: Record<string, string[]> = {
    '/':         ['Operations', 'Command Center'],
    '/today':    ['Operations', "Today's Recovery"],
    '/denials':  ['Operations', 'Denial Command'],
    '/queues':   ['Operations', 'Work Queues'],
    '/claims':   ['Operations', 'Claims Workbench'],
    '/appeals':  ['Operations', 'Appeals Workbench'],
    '/evidence': ['Operations', 'Evidence Vault'],
    '/leak':     ['Operations', 'Revenue Leak'],
    '/payers':   ['Operations', 'Payer Intelligence'],
    '/reports':  ['Operations', 'Executive Reporting'],
    '/ingest':   ['Operations', 'Ingestion'],
    '/audit':    ['Operations', 'Audit & Trace'],
  };
  if (map[pathname]) return map[pathname];
  if (pathname.startsWith('/denials/')) return ['Operations', 'Denial Command', pathname.split('/')[2]];
  if (pathname.startsWith('/claims/'))  return ['Operations', 'Claims Workbench', pathname.split('/')[2]];
  if (pathname.startsWith('/queues/'))  return ['Operations', 'Work Queues', decodeURIComponent(pathname.split('/')[2])];
  return ['Operations'];
}
