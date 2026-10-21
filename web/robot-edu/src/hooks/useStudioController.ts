import { useCallback, useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { toast } from 'sonner';
import type { ExecutionResult } from '../types/robot';
import type { GenerationResult, LogEntry, ProgramRecord, SimState } from '../types/robotProgram';
import { applyBlockWarnings, focusBlock } from '../components/studio/blocklyConfig';
import { useAdmin } from '../contexts/AdminContext';
import { useLearning } from '../contexts/LearningContext';
import { usePrograms } from '../contexts/ProgramsContext';
import { simulationAdapter } from '../utils/robot/adapters';
import { generateProgram } from '../utils/robotProgram/generator';
import { createInitialState, estimateSteps } from '../utils/robotProgram/simulator';
import { hasErrors } from '../utils/robotProgram/validator';

export type SaveState = 'saved' | 'unsaved' | 'error';
export type RunStatus = 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
export type InspectorTab = 'task' | 'problems' | 'logs' | 'output';

export interface RunInfo {
  status: RunStatus;
  step: number;
  total: number;
  label: string;
  startedAt: number | null;
}

const IDLE_RUN: RunInfo = { status: 'idle', step: 0, total: 0, label: '', startedAt: null };

export function useStudioController(record: ProgramRecord | undefined) {
  const { saveWorkspace, addExperiment } = usePrograms();
  const { getProgress, updateProgress } = useLearning();
  const { settings } = useAdmin();

  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  /** Id of the program currently loaded in the workspace (may lag behind `record` during a switch). */
  const wsRecordIdRef = useRef<string | null>(null);
  const recordRef = useRef(record);
  recordRef.current = record;
  const saveTimer = useRef<number>();
  const genTimer = useRef<number>();
  const pendingSave = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(record?.updatedAt ?? null);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [tab, setTab] = useState<InspectorTab>(record?.assignmentId ? 'task' : 'problems');
  const [run, setRun] = useState<RunInfo>(IDLE_RUN);
  const [simState, setSimState] = useState<SimState>(createInitialState);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastRun, setLastRun] = useState<ExecutionResult | null>(null);
  const [simSpeed, setSimSpeed] = useState<number>(settings.defaultSimulationSpeed);
  const [loadError, setLoadError] = useState<string | null>(null);

  const regenerate = useCallback((): GenerationResult | null => {
    const ws = wsRef.current;
    const r = recordRef.current;
    if (!ws || !r) return null;
    const result = generateProgram(ws, { id: r.id, name: r.name });
    setGeneration(result);
    applyBlockWarnings(ws, result.problems);
    return result;
  }, []);

  const saveNow = useCallback(
    (workspace?: Blockly.WorkspaceSvg) => {
      window.clearTimeout(saveTimer.current);
      const ws = workspace ?? wsRef.current;
      const id = wsRecordIdRef.current;
      if (!ws || !id) return;
      try {
        saveWorkspace(id, Blockly.serialization.workspaces.save(ws));
        pendingSave.current = false;
        setSaveState('saved');
        setLastSavedAt(new Date().toISOString());
      } catch {
        setSaveState('error');
      }
    },
    [saveWorkspace]
  );

  const refreshHistory = useCallback(() => {
    const ws = wsRef.current as unknown as {getUndoStack?: () => unknown[];getRedoStack?: () => unknown[];} | null;
    if (!ws) return;
    setHistory({ canUndo: (ws.getUndoStack?.() ?? [1]).length > 0, canRedo: (ws.getRedoStack?.() ?? [1]).length > 0 });
  }, []);

  const handleReady = useCallback(
    (ws: Blockly.WorkspaceSvg) => {
      wsRef.current = ws;
      wsRecordIdRef.current = recordRef.current?.id ?? null;
      pendingSave.current = false;
      regenerate();
      refreshHistory();
    },
    [regenerate, refreshHistory]
  );

  const handleBeforeDispose = useCallback(
    (ws: Blockly.WorkspaceSvg) => {
      if (pendingSave.current) saveNow(ws);
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(genTimer.current);
      wsRef.current = null;
      wsRecordIdRef.current = null;
    },
    [saveNow]
  );

  const handleChange = useCallback(
    (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      refreshHistory();
      pendingSave.current = true;
      setSaveState('unsaved');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveNow(), Math.max(0.5, settings.autosaveSeconds) * 1000);
      window.clearTimeout(genTimer.current);
      genTimer.current = window.setTimeout(regenerate, 350);
      const r = recordRef.current;
      if (r?.assignmentId && getProgress(r.assignmentId).status === 'not_started') {
        updateProgress(r.assignmentId, { status: 'in_progress', programId: r.id });
      }
    },
    [refreshHistory, saveNow, regenerate, settings.autosaveSeconds, getProgress, updateProgress]
  );

  const undo = useCallback(() => wsRef.current?.undo(false), []);
  const redo = useCallback(() => wsRef.current?.undo(true), []);

  const goToBlock = useCallback((blockId: string) => {
    const ws = wsRef.current;
    if (!ws || !focusBlock(ws, blockId)) toast.info('That block no longer exists in the program.');
  }, []);

  const validate = useCallback(() => {
    const result = regenerate();
    if (!result) return;
    const errors = result.problems.filter((p) => p.severity === 'error').length;
    const warnings = result.problems.length - errors;
    setTab('problems');
    if (errors) toast.error(`${errors} error${errors > 1 ? 's' : ''} to fix`, { description: warnings ? `${warnings} warning${warnings > 1 ? 's' : ''} as well.` : undefined });else
    if (warnings) toast.warning(`Valid, with ${warnings} warning${warnings > 1 ? 's' : ''}`);else
    toast.success('Program is valid', { description: 'Ready to run in the simulator.' });
  }, [regenerate]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const resetSimulation = useCallback(() => {
    if (run.status === 'running') return;
    setSimState(createInitialState());
    setRun(IDLE_RUN);
    wsRef.current?.highlightBlock(null);
  }, [run.status]);

  const startRun = useCallback(async () => {
    if (run.status === 'running') return;
    const result = regenerate();
    const ws = wsRef.current;
    const r = recordRef.current;
    if (!result || !ws || !r) return;
    if (hasErrors(result.problems)) {
      setTab('problems');
      toast.error('Fix errors before running', { description: 'Select a problem to jump to its block.' });
      return;
    }
    if (result.program.commands.length === 0) {
      toast.warning('Nothing to run', { description: 'Attach blocks under "when program starts".' });
      return;
    }
    if (pendingSave.current) saveNow();

    const total = await estimateSteps(result.program);
    const controller = new AbortController();
    abortRef.current = controller;
    const startedIso = new Date().toISOString();
    setLogs([]);
    setTab('logs');
    setRun({ status: 'running', step: 0, total, label: 'Starting…', startedAt: performance.now() });

    const outcome = await simulationAdapter.execute(
      result.program,
      {
        onState: setSimState,
        onStep: (s) => {
          setRun((prev) => ({ ...prev, step: s.index, label: s.label }));
          const live = wsRef.current;
          if (live && live.getBlockById(s.blockId)) live.highlightBlock(s.blockId);
        },
        onLog: (entry) => setLogs((prev) => [...prev, entry].slice(-500))
      },
      { signal: controller.signal, speed: simSpeed }
    );

    abortRef.current = null;
    wsRef.current?.highlightBlock(null);
    setRun((prev) => ({ ...prev, status: outcome.outcome, label: outcome.outcome === 'completed' ? 'Completed' : outcome.outcome === 'stopped' ? 'Stopped' : 'Failed' }));
    setLastRun(outcome);
    addExperiment({
      programId: r.id,
      programName: r.name,
      assignmentId: r.assignmentId,
      adapter: 'simulation',
      startedAt: startedIso,
      durationMs: outcome.durationMs,
      outcome: outcome.outcome,
      steps: outcome.steps,
      note: outcome.error
    });
    if (outcome.outcome === 'completed') toast.success('Simulation completed', { description: `${outcome.steps} steps.` });else
    if (outcome.outcome === 'failed') toast.error('Simulation failed', { description: outcome.error });
  }, [run.status, regenerate, saveNow, simSpeed, addExperiment]);

  // Keyboard shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+Enter run, Ctrl/Cmd+. stop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 's') {
        e.preventDefault();
        saveNow();
        toast.success('Saved to this browser');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void startRun();
      } else if (e.key === '.') {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, startRun, stop]);

  // Reset per-program session state when switching programs.
  useEffect(() => {
    abortRef.current?.abort();
    setSaveState('saved');
    setLastSavedAt(recordRef.current?.updatedAt ?? null);
    setLogs([]);
    setLastRun(null);
    setRun(IDLE_RUN);
    setSimState(createInitialState());
    setTab(recordRef.current?.assignmentId ? 'task' : 'problems');
  }, [record?.id]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(genTimer.current);
    },
    []
  );

  return {
    workspaceRef: wsRef,
    saveState,
    lastSavedAt,
    generation,
    history,
    tab,
    setTab,
    run,
    simState,
    logs,
    clearLogs: () => setLogs([]),
    lastRun,
    simSpeed,
    setSimSpeed,
    loadError,
    setLoadError,
    handleReady,
    handleChange,
    handleBeforeDispose,
    undo,
    redo,
    validate,
    regenerate,
    startRun,
    stop,
    resetSimulation,
    saveNow,
    goToBlock
  };
}

export type StudioController = ReturnType<typeof useStudioController>;