import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Role } from '../types/user';
import { identityApi, type ApiOrganizationMembership } from '../lib/api';
import { useSupabaseSession } from './SupabaseSessionContext';
import { loadAccessContext } from './accessContext';

interface RoleContextValue { role: Role | null; memberships: ApiOrganizationMembership[]; loading: boolean; error: string | null; }
const RoleContext = createContext<RoleContextValue | null>(null);
export function RoleProvider({ children }: {children: React.ReactNode;}) {
  const { session }=useSupabaseSession(); const [role,setRole]=useState<Role|null>(null); const [memberships,setMemberships]=useState<ApiOrganizationMembership[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let live=true;if(!session){setRole(null);setMemberships([]);setLoading(false);setError(null);return()=>{live=false;};}setLoading(true);setError(null);void loadAccessContext(session.access_token,identityApi).then((access)=>{if(!access.role)throw new Error('Your account has no active VISTA role.');if(live){setRole(access.role);setMemberships(access.memberships);}}).catch((cause:unknown)=>live&&setError(cause instanceof Error?cause.message:'Unable to resolve your VISTA role.')).finally(()=>live&&setLoading(false));return()=>{live=false;};},[session]);
  const value=useMemo(()=>({role,memberships,loading,error}),[role,memberships,loading,error]);return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
export function useRole(): RoleContextValue {const ctx=useContext(RoleContext);if(!ctx)throw new Error('useRole must be used within RoleProvider');return ctx;}
