import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, GitBranch, Database, Layers, Network,
  ListChecks, Waypoints, Settings, Shield
} from 'lucide-react';
import { useLiveFeed } from '@/hooks/useLiveFeed';

const Sidebar = () => {
  const location = useLocation();
  const { summary } = useLiveFeed();

  const reviewBadge = summary?.review_pending ?? 0;

  const navGroups = [
    {
      label: null,
      items: [
        { name: 'Command Center', path: '/', icon: LayoutGrid },
      ],
    },
    {
      label: 'PIPELINE',
      items: [
        { name: 'Orchestration', path: '/pipeline', icon: GitBranch },
      ],
    },
    {
      label: 'DATA LAYERS',
      items: [
        { name: 'Raw Vault', path: '/raw-vault', icon: Database, count: summary?.vault_records },
        { name: 'Canonical Layer', path: '/canonical', icon: Layers, count: summary?.canonical_records },
        { name: 'Identity Graph', path: '/identity-graph', icon: Network, count: summary?.identity_matches },
        { name: 'Master Records', path: '/master-records', icon: Shield, count: summary?.master_records },
      ],
    },
    {
      label: 'OPERATIONS',
      items: [
        { name: 'Review Workbench', path: '/review', icon: ListChecks, badge: reviewBadge > 0 ? reviewBadge : undefined },
        { name: 'Data Lineage', path: '/lineage', icon: Waypoints },
      ],
    },
  ];

  const formatCount = (n?: number) => {
    if (n === undefined || n === null) return null;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
  };

  return (
    <aside className="w-[220px] h-screen bg-[var(--color-surface-2)] border-r border-[var(--color-border)] flex flex-col transition-all duration-300 relative z-20 backdrop-blur-2xl backdrop-filter">
      <div className="px-4 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[var(--color-accent-primary)] flex items-center justify-center">
            <span className="text-[var(--color-background)] text-xs font-bold font-mono">DF</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)] leading-none">DataFusion</div>
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">Intelligence Platform</div>
          </div>
        </div>
      </div>
      <div className="flex-1 py-3 px-2 flex flex-col gap-1 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
            {group.label && (
              <div className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-muted)] uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const count = 'count' in item ? formatCount((item as any).count) : null;
              const badge = 'badge' in item ? (item as any).badge : undefined;
              return (
                <NavLink
                  to={item.path}
                  key={item.name}
                  className={
                    `flex items-center justify-between px-3 py-2 rounded-md transition-all cursor-pointer group ` +
                    (isActive
                      ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] shadow-[inset_2px_0_0_0_var(--color-accent-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-1)]')
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={15} className={isActive ? 'text-[var(--color-accent-primary)]' : 'group-hover:text-[var(--color-accent-primary)] transition-colors'} />
                    <span className="text-xs font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {count && <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{count}</span>}
                    {badge !== undefined && badge > 0 && (
                      <span className="bg-[var(--color-danger)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span>
                    )}
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[var(--color-border)] flex flex-col gap-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ` +
            (isActive ? 'text-[var(--color-accent-primary)] bg-[var(--color-surface-1)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-1)]')
          }
        >
          <Settings size={15} />
          Settings
        </NavLink>
        <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-[var(--color-text-muted)] font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${summary?.pipeline_health === 'healthy' ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-warning)]'}`} />
          {summary?.pipeline_health === 'healthy' ? 'API Connected' : 'API Degraded'}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
