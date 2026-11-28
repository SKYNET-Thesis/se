import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Role } from '../types/user';
import { identityApi, type ApiOrganizationMembership } from '../lib/api';
import { useSupabaseSession } from './SupabaseSessionContext';
import { loadAccessContext } from './accessContext';

interface RoleContextValue { role: Role | null; memberships: ApiOrganizationMembership[]; loading: boolean; error: string | null; }
const RoleContext = createContext<RoleContextValue | null>(null);
export function RoleProvider({ children }: {children: React.ReactNode;}) {
  const { session }=useSupabaseSession(); const [role,setRole]=useState<Role|null>(null); const [memberships,setMemberships]=useState<ApiOrganizationMembership[]>([]); const [contextUserId,setContextUserId]=useState<string|null>(null); const contextUserIdRef=useRef<string|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let live=true;if(!session){contextUserIdRef.current=null;setRole(null);setMemberships([]);setContextUserId(null);setLoading(false);setError(null);return()=>{live=false;};}
    const sameUser=contextUserIdRef.current===session.user.id;
    if(!sameUser){contextUserIdRef.current=session.user.id;setRole(null);setMemberships([]);setContextUserId(session.user.id);setLoading(true);}
    setError(null);
    void loadAccessContext(session.access_token,identityApi).then((access)=>{if(live){setRole(access.role);setMemberships(access.memberships);if(!access.role)setError('Your account has no active VISTA role.');}}).catch((cause:unknown)=>{if(!live)return;setRole(null);setMemberships([]);setError(cause instanceof Error?cause.message:'Unable to resolve your VISTA role.');}).finally(()=>live&&setLoading(false));
    return()=>{live=false;};},[session]);
  const contextMatchesSession=Boolean(session&&contextUserId===session.user.id);
  const value=useMemo(()=>({role:contextMatchesSession?role:null,memberships:contextMatchesSession?memberships:[],loading:session?(!contextMatchesSession||loading):false,error:contextMatchesSession?error:null}),[role,memberships,contextMatchesSession,loading,session,error]);return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
export function useRole(): RoleContextValue {const ctx=useContext(RoleContext);if(!ctx)throw new Error('useRole must be used within RoleProvider');return ctx;}
export function useOptionalRole(): RoleContextValue | null { return useContext(RoleContext); }
