import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Blockly from 'blockly';
import { toast } from 'sonner';
import type { ProgramRecord } from '../types/robotProgram';
import type { StudioController } from './useStudioController';
import type { NewProgramInput } from '../components/studio/NewProgramDialog';
import { assertLoadable } from '../components/studio/blocklyConfig';
import { useAdmin } from '../contexts/AdminContext';
import { usePrograms } from '../contexts/ProgramsContext';
import { useRole } from '../contexts/RoleContext';
import { downloadJson, parseProgramFile, slugify, toProgramFile } from '../utils/robotProgram/programFile';
import { hasErrors } from '../utils/robotProgram/validator';

export function useProgramActions(record: ProgramRecord, controller: StudioController) {
  const navigate = useNavigate();
  const { programs, createProgram, renameProgram, duplicateProgram, deleteProgram } = usePrograms();
  const { settings } = useAdmin();
  const { role } = useRole();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<'new' | 'delete' | 'preview' | 'robot' | null>(null);
  const [renameSignal, setRenameSignal] = useState(0);

  const exportAllowed = role !== 'student' || settings.allowStudentExport;

  const create = useCallback(
    (input: NewProgramInput) => {
      const created = createProgram(input);
      setDialog(null);
      navigate(`/studio/${created.id}`);
      toast.success(`Created “${created.name}”`);
    },
    [createProgram, navigate]
  );

  const rename = useCallback(
    (name: string) => {
      renameProgram(record.id, name);
      toast.success('Program renamed');
    },
    [renameProgram, record.id]
  );

  const duplicate = useCallback(() => {
    controller.saveNow();
    const copy = duplicateProgram(record.id);
    if (copy) {
      navigate(`/studio/${copy.id}`);
      toast.success(`Duplicated as “${copy.name}”`);
    }
  }, [controller, duplicateProgram, navigate, record.id]);

  const confirmDelete = useCallback(() => {
    const next = programs.filter((p) => p.id !== record.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    setDialog(null);
    navigate(next ? `/studio/${next.id}` : '/studio', { replace: true });
    deleteProgram(record.id);
    toast.success(`Deleted “${record.name}”`);
  }, [programs, record.id, record.name, navigate, deleteProgram]);

  const exportFile = useCallback(() => {
    if (!exportAllowed) return toast.error('Export is turned off for students in System settings.');
    const ws = controller.workspaceRef.current;
    const workspace = ws ? Blockly.serialization.workspaces.save(ws) : record.workspace;
    downloadJson(`${slugify(record.name)}.vista.json`, toProgramFile({ ...record, workspace }));
    toast.success('Program file downloaded');
    return undefined;
  }, [controller.workspaceRef, exportAllowed, record]);

  const exportProgram = useCallback(() => {
    if (!exportAllowed) return toast.error('Export is turned off for students in System settings.');
    const result = controller.regenerate();
    if (!result) return undefined;
    if (hasErrors(result.problems)) {
      controller.setTab('problems');
      return toast.error('Fix errors before exporting', { description: 'Only valid RobotPrograms can be exported.' });
    }
    downloadJson(`${slugify(record.name)}.robot-program.json`, result.program);
    toast.success('RobotProgram exported');
    return undefined;
  }, [controller, exportAllowed, record.name]);

  const importFile = useCallback(
    async (file: File) => {
      if (file.size > 2_000_000) return toast.error('That file is too large to be a VISTA program.');
      const parsed = parseProgramFile(await file.text());
      if (!parsed.ok) return toast.error('Import failed', { description: parsed.error });
      try {
        assertLoadable(parsed.file.workspace);
      } catch (err) {
        return toast.error('Import failed', { description: `The program contains blocks VISTA doesn't recognise. ${err instanceof Error ? err.message : ''}` });
      }
      const created = createProgram({ name: parsed.file.name.slice(0, 60) || 'Imported program', workspace: parsed.file.workspace });
      navigate(`/studio/${created.id}`);
      toast.success(`Imported “${created.name}”`);
      return undefined;
    },
    [createProgram, navigate]
  );

  return {
    dialog,
    setDialog,
    renameSignal,
    requestRename: () => setRenameSignal((n) => n + 1),
    fileInputRef,
    create,
    rename,
    duplicate,
    confirmDelete,
    exportFile,
    exportProgram,
    importFile,
    openImport: () => fileInputRef.current?.click()
  };
}