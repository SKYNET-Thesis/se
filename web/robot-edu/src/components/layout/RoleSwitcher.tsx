import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../contexts/RoleContext';
import { demoPersonas } from '../../data/demoPersonas';
import type { Role } from '../../types/user';
import { cn } from '../../utils/cn';

const roles: Array<{id: Role;label: string;home: string;}> = [
{ id: 'student', label: 'Student', home: '/' },
{ id: 'teacher', label: 'Teacher', home: '/teacher' },
{ id: 'admin', label: 'Admin', home: '/admin/users' }];


export function RoleSwitcher({ onSwitched }: {onSwitched?: () => void;}) {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const persona = demoPersonas[role];

  return (
    <div className="rounded-lg border border-dashed border-line-strong p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-muted" aria-hidden>
          {persona.name.
          split(' ').
          map((p) => p[0]).
          join('')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{persona.name}</p>
          <p className="truncate text-2xs text-ink-subtle">{persona.detail}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Preview the demo as" className="mt-3 grid grid-cols-3 gap-0.5 rounded-md bg-sunken p-0.5">
        {roles.map((r) =>
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={role === r.id}
          onClick={() => {
            setRole(r.id);
            navigate(r.home);
            onSwitched?.();
          }}
          className={cn(
            'h-7 rounded text-xs font-medium transition-colors duration-150',
            role === r.id ? 'bg-surface text-ink shadow-hairline' : 'text-ink-muted hover:text-ink'
          )}>
          
            {r.label}
          </button>
        )}
      </div>
      <p className="mt-2 text-2xs leading-4 text-ink-subtle">Demo preview only. Switching views is not sign-in and grants no access.</p>
    </div>);

}