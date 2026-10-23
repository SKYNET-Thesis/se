import React from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../../types/user';
import { useRole } from '../../contexts/RoleContext';
export function RequireRole({roles,children}:{roles:Role[];children:React.ReactNode}) { const {role,loading,error}=useRole();if(loading)return <main className="grid min-h-full place-items-center p-8 text-sm text-ink-muted">Resolving authorized workspace…</main>;if(error||!role)return <main className="grid min-h-full place-items-center p-8 text-center"><div><h1 className="text-xl font-semibold text-ink">Workspace unavailable</h1><p className="mt-2 text-sm text-ink-muted">{error??'No active VISTA role is available for this account.'}</p></div></main>;return roles.includes(role)?<>{children}</>:<Navigate to="/" replace/>; }
