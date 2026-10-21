import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { ExperimentRecord } from '../types/robot';
import type { ProgramRecord } from '../types/robotProgram';
import { starterPrograms } from '../data/starterPrograms';
import { usePersistentState } from '../hooks/usePersistentState';
import { createId } from '../utils/id';
import { isProgramRecord } from '../utils/robotProgram/programFile';
import { isRecord, STORAGE_KEYS } from '../utils/storage';
import { daysFromNow } from '../utils/format';

interface ProgramsContextValue {
  programs: ProgramRecord[];
  experiments: ExperimentRecord[];
  getProgram: (id: string) => ProgramRecord | undefined;
  createProgram: (input: {name: string;starterId?: string;assignmentId?: string | null;workspace?: Record<string, unknown>;}) => ProgramRecord;
  renameProgram: (id: string, name: string) => void;
  duplicateProgram: (id: string) => ProgramRecord | null;
  deleteProgram: (id: string) => void;
  saveWorkspace: (id: string, workspace: Record<string, unknown>) => void;
  addExperiment: (record: Omit<ExperimentRecord, 'id'>) => void;
}

const ProgramsContext = createContext<ProgramsContextValue | null>(null);

function starterWorkspace(id: string): Record<string, unknown> {
  return (starterPrograms.find((s) => s.id === id) ?? starterPrograms[0]).workspace;
}

function seedPrograms(): ProgramRecord[] {
  return [
  { id: 'prog_pick_red', name: 'Sort the red cube', assignmentId: 'asg-sort-red', createdAt: daysFromNow(-3, 10), updatedAt: daysFromNow(-1, 16), workspace: starterWorkspace('pick-red') },
  { id: 'prog_reach', name: 'Reach test (draft)', assignmentId: 'asg-reach', createdAt: daysFromNow(-2, 11), updatedAt: daysFromNow(0, 8), workspace: starterWorkspace('reach-draft') },
  { id: 'prog_wave', name: 'Wave hello practice', assignmentId: null, createdAt: daysFromNow(-6, 9), updatedAt: daysFromNow(-4, 15), workspace: starterWorkspace('wave') }];

}

const isPrograms = (v: unknown): v is ProgramRecord[] => Array.isArray(v) && v.every(isProgramRecord);
const isExperiments = (v: unknown): v is ExperimentRecord[] =>
Array.isArray(v) && v.every((e) => isRecord(e) && typeof e.id === 'string' && typeof e.startedAt === 'string');

export function ProgramsProvider({ children }: {children: React.ReactNode;}) {
  const [programs, setPrograms, programsStatus] = usePersistentState(STORAGE_KEYS.programs, 1, seedPrograms, isPrograms);
  const [experiments, setExperiments] = usePersistentState<ExperimentRecord[]>(STORAGE_KEYS.experiments, 1, () => [], isExperiments);

  useEffect(() => {
    if (programsStatus === 'invalid' || programsStatus === 'outdated') {
      toast.warning('Saved programs could not be read', { description: 'They were from an older or damaged save. Demo programs were restored.' });
    }
    if (programsStatus === 'unavailable') {
      toast.error('Browser storage is unavailable', { description: 'Programs will not persist after you close this tab.' });
    }
  }, [programsStatus]);

  const getProgram = useCallback((id: string) => programs.find((p) => p.id === id), [programs]);

  const createProgram = useCallback<ProgramsContextValue['createProgram']>(
    ({ name, starterId = 'blank', assignmentId = null, workspace }) => {
      const now = new Date().toISOString();
      const record: ProgramRecord = { id: createId('prog'), name, assignmentId, createdAt: now, updatedAt: now, workspace: workspace ?? starterWorkspace(starterId) };
      setPrograms((prev) => [record, ...prev]);
      return record;
    },
    [setPrograms]
  );

  const renameProgram = useCallback(
    (id: string, name: string) => setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p)),
    [setPrograms]
  );

  const duplicateProgram = useCallback(
    (id: string) => {
      const source = programs.find((p) => p.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy: ProgramRecord = { ...source, id: createId('prog'), name: `${source.name} (copy)`, createdAt: now, updatedAt: now };
      setPrograms((prev) => [copy, ...prev]);
      return copy;
    },
    [programs, setPrograms]
  );

  const deleteProgram = useCallback((id: string) => setPrograms((prev) => prev.filter((p) => p.id !== id)), [setPrograms]);

  const saveWorkspace = useCallback(
    (id: string, workspace: Record<string, unknown>) =>
    setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, workspace, updatedAt: new Date().toISOString() } : p)),
    [setPrograms]
  );

  const addExperiment = useCallback(
    (record: Omit<ExperimentRecord, 'id'>) => setExperiments((prev) => [{ ...record, id: createId('exp') }, ...prev].slice(0, 50)),
    [setExperiments]
  );

  const value = useMemo(
    () => ({ programs, experiments, getProgram, createProgram, renameProgram, duplicateProgram, deleteProgram, saveWorkspace, addExperiment }),
    [programs, experiments, getProgram, createProgram, renameProgram, duplicateProgram, deleteProgram, saveWorkspace, addExperiment]
  );
  return <ProgramsContext.Provider value={value}>{children}</ProgramsContext.Provider>;
}

export function usePrograms(): ProgramsContextValue {
  const ctx = useContext(ProgramsContext);
  if (!ctx) throw new Error('usePrograms must be used within ProgramsProvider');
  return ctx;
}