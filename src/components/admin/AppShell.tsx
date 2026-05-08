import { ReactNode, useState } from 'react';
import { Shield, Inbox, Briefcase, Network, GitCompareArrows, ScrollText, Settings, Search, Bell, ChevronRight, HelpCircle, User, Database, Activity } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
  breadcrumb: { label: string; onClick?: () => void }[];
  cloudOnline: boolean;
}

const NAV = [
  { id: 'claims',    label: 'Claims Workbench', icon: Inbox,            active: true,  badge: 3 },
  { id: 'cases',     label: 'Cases',            icon: Briefcase,        active: false, badge: 1 },
  { id: 'coverage',  label: 'Coverage Graph',   icon: Network,          active: false, planned: true },
  { id: 'migration', label: 'Migration Cockpit',icon: GitCompareArrows, active: false, planned: true },
  { id: 'audit',     label: 'Audit Log',        icon: ScrollText,       active: false, planned: true },
  { id: 'settings',  label: 'Configuration',    icon: Settings,         active: false, planned: true },
];

export function AppShell({ children, breadcrumb, cloudOnline }: AppShellProps) {
  const [activeId, setActiveId] = useState('claims');

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-0 text-foreground">
      {/* Left rail */}
      <aside className="w-60 shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary/15 border border-sidebar-primary/30 flex items-center justify-center">
            <Shield className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-tight">DualPay</div>
            <div className="text-[10px] font-mono text-sidebar-foreground/55">Core Admin · v2.4</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
            Modules
          </div>
          {NAV.map(item => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                disabled={item.planned}
                onClick={() => !item.planned && setActiveId(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : item.planned
                      ? 'text-sidebar-foreground/35 cursor-not-allowed'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge !== undefined && !item.planned && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-sidebar-accent text-sidebar-foreground/70'
                  }`}>
                    {item.badge}
                  </span>
                )}
                {item.planned && (
                  <span className="text-[9px] font-mono uppercase tracking-wider text-sidebar-foreground/40">soon</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-2.5 border-t border-sidebar-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
            <Database className={`h-3 w-3 ${cloudOnline ? 'text-status-paid' : 'text-status-denied'}`} />
            <span className="text-sidebar-foreground/70">Cloud</span>
            <span className={cloudOnline ? 'text-status-paid' : 'text-status-denied'}>
              {cloudOnline ? 'PERSISTED' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
            <Activity className="h-3 w-3 text-status-paid" />
            <span className="text-sidebar-foreground/70">Engine</span>
            <span className="text-status-paid">ONLINE</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 shrink-0 flex items-center gap-4 px-5 border-b bg-card">
          <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {b.onClick ? (
                  <button onClick={b.onClick} className="text-muted-foreground hover:text-foreground truncate">
                    {b.label}
                  </button>
                ) : (
                  <span className={`truncate ${i === breadcrumb.length - 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                    {b.label}
                  </span>
                )}
              </span>
            ))}
          </nav>

          <div className="flex-1 max-w-md ml-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search claims, members, providers, cases…"
                className="w-full h-8 pl-8 pr-3 text-[12.5px] rounded-md bg-muted/60 border border-transparent focus:bg-card focus:border-input focus:outline-none focus:ring-2 focus:ring-ring/40 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold tracking-wider px-2 py-0.5 rounded border border-status-pending/40 bg-status-pending/10 text-status-pending">
              UAT
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

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
