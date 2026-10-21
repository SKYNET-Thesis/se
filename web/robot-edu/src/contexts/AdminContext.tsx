import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { DemoUser, RobotResource, SystemSettings } from '../types/user';
import { defaultSettings, demoRobotResources, demoUsers } from '../data/adminDemo';
import { usePersistentState } from '../hooks/usePersistentState';
import { isRecord, STORAGE_KEYS } from '../utils/storage';

interface AdminState {
  users: DemoUser[];
  robots: RobotResource[];
  settings: SystemSettings;
}

interface AdminContextValue extends AdminState {
  upsertUser: (user: DemoUser) => void;
  removeUser: (id: string) => void;
  upsertRobot: (robot: RobotResource) => void;
  removeRobot: (id: string) => void;
  updateSettings: (settings: SystemSettings) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const isAdminState = (v: unknown): v is AdminState => isRecord(v) && Array.isArray(v.users) && Array.isArray(v.robots) && isRecord(v.settings);

export function AdminProvider({ children }: {children: React.ReactNode;}) {
  const [state, setState] = usePersistentState<AdminState>(
    STORAGE_KEYS.admin,
    1,
    () => ({ users: demoUsers, robots: demoRobotResources, settings: defaultSettings }),
    isAdminState
  );

  const upsertUser = useCallback(
    (user: DemoUser) =>
    setState((prev) => ({ ...prev, users: prev.users.some((u) => u.id === user.id) ? prev.users.map((u) => u.id === user.id ? user : u) : [user, ...prev.users] })),
    [setState]
  );
  const removeUser = useCallback((id: string) => setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) })), [setState]);
  const upsertRobot = useCallback(
    (robot: RobotResource) =>
    setState((prev) => ({ ...prev, robots: prev.robots.some((r) => r.id === robot.id) ? prev.robots.map((r) => r.id === robot.id ? robot : r) : [...prev.robots, robot] })),
    [setState]
  );
  const removeRobot = useCallback((id: string) => setState((prev) => ({ ...prev, robots: prev.robots.filter((r) => r.id !== id) })), [setState]);
  const updateSettings = useCallback((settings: SystemSettings) => setState((prev) => ({ ...prev, settings })), [setState]);

  const value = useMemo(
    () => ({ ...state, upsertUser, removeUser, upsertRobot, removeRobot, updateSettings }),
    [state, upsertUser, removeUser, upsertRobot, removeRobot, updateSettings]
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}