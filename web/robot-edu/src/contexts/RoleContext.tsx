import React, { createContext, useContext, useMemo } from 'react';
import type { Role } from '../types/user';
import { usePersistentState } from '../hooks/usePersistentState';
import { STORAGE_KEYS } from '../utils/storage';

interface RoleContextValue {
  /** Demo preview role. Controls navigation only — it is NOT authentication or authorization. */
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const isRole = (v: unknown): v is Role => v === 'student' || v === 'teacher' || v === 'admin';

export function RoleProvider({ children }: {children: React.ReactNode;}) {
  const [role, setRole] = usePersistentState<Role>(STORAGE_KEYS.role, 1, () => 'student', isRole);
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}