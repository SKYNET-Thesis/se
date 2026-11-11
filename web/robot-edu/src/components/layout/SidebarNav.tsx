import React from 'react';
import { NavLink } from 'react-router-dom';
import { useRole } from '../../contexts/RoleContext';
import { navigationByRole } from '../../data/navigation';
import { cn } from '../../utils/cn';

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { role, loading } = useRole();
  if (loading || !role) return <p className="px-2.5 text-sm text-ink-muted">Loading workspace…</p>;
  const sections = navigationByRole[role];
  return (
    <nav aria-label="Main" className="space-y-5">
      {sections.map((section, i) =>
      <div key={section.title ?? i}>
          {section.title && !collapsed && <p className="mb-1.5 px-2.5 text-2xs font-medium text-ink-subtle">{section.title}</p>}
          {section.title && collapsed && i > 0 && <div className="mx-3 mb-3 border-t border-line" aria-hidden />}
          <ul className="space-y-0.5">
            {section.items.map((item) =>
          <li key={item.to + item.label}>
                <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) =>
              cn(
                'group flex h-9 items-center gap-2.5 rounded-md text-sm font-medium transition-colors duration-150',
                collapsed ? 'justify-center px-0' : 'px-2.5',
                isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink'
              )
              }>
              
                  <item.icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
          )}
          </ul>
        </div>
      )}
    </nav>);

}
