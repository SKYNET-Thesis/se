import React from 'react';
import { CheckCircle2Icon, CircleAlertIcon, CloudOffIcon, EyeIcon, LoaderIcon, PlayIcon, Redo2Icon, ShieldCheckIcon, SquareIcon, Undo2Icon, CpuIcon } from 'lucide-react';
import type { ProgramRecord } from '../../types/robotProgram';
import type { StudioController } from '../../hooks/useStudioController';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ProgramMenu } from './ProgramMenu';
import { ProgramNameField } from './ProgramNameField';
import { formatRelative } from '../../utils/format';

interface StudioToolbarProps {
  record: ProgramRecord;
  programs: ProgramRecord[];
  controller: StudioController;
  renameSignal: number;
  onRename: (name: string) => void;
  onOpenProgram: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onRequestRename: () => void;
  onDelete: () => void;
  onImport: () => void;
  onExportFile: () => void;
  onExportProgram: () => void;
  onPreview: () => void;
  onRealRobot: () => void;
}

export function StudioToolbar(props: StudioToolbarProps) {
  const { record, controller: c } = props;
  const running = c.run.status === 'running';
  const errors = c.generation?.problems.filter((p) => p.severity === 'error').length ?? 0;

  return (
    <div className="relative z-40 flex h-[52px] shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
      <ProgramMenu
        programs={props.programs}
        currentId={record.id}
        onOpen={props.onOpenProgram}
        onNew={props.onNew}
        onDuplicate={props.onDuplicate}
        onRename={props.onRequestRename}
        onDelete={props.onDelete}
        onImport={props.onImport}
        onExportFile={props.onExportFile}
        onExportProgram={props.onExportProgram} />
      
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ProgramNameField name={record.name} onRename={props.onRename} editSignal={props.renameSignal} />
      <SaveIndicator state={c.saveState} lastSavedAt={c.lastSavedAt} />

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Undo (Ctrl+Z)" onClick={c.undo} disabled={!c.history.canUndo}>
          <Undo2Icon />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={c.redo} disabled={!c.history.canRedo}>
          <Redo2Icon />
        </IconButton>
        <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
        <Button size="sm" variant="ghost" onClick={c.validate} icon={errors ? <CircleAlertIcon className="h-4 w-4 text-danger" /> : <ShieldCheckIcon className="h-4 w-4" />}>
          Validate
          {errors > 0 && <span className="tabular rounded bg-danger-soft px-1.5 text-2xs font-semibold text-danger">{errors}</span>}
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onPreview} icon={<EyeIcon className="h-4 w-4" />}>
          Preview
        </Button>
        <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
        {running ?
        <Button size="sm" variant="secondary" onClick={c.stop} icon={<SquareIcon className="h-3.5 w-3.5 fill-current" />} title="Stop simulation (Ctrl+.)">
            Stop simulation
          </Button> :

        <Button size="sm" variant="primary" onClick={() => void c.startRun()} icon={<PlayIcon className="h-3.5 w-3.5 fill-current" />} title="Run simulation (Ctrl+Enter)">
            Run simulation
          </Button>
        }
        <button
          type="button"
          aria-disabled="true"
          onClick={props.onRealRobot}
          title="Real robot execution is disabled until the integration is verified"
          className="ml-1 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-line-strong px-2.5 text-[13px] font-medium text-ink-subtle hover:bg-sunken">
          
          <CpuIcon className="h-3.5 w-3.5" aria-hidden />
          Run on robot
          <span className="sr-only">(unavailable, select for details)</span>
        </button>
      </div>
    </div>);

}

function SaveIndicator({ state, lastSavedAt }: {state: StudioController['saveState'];lastSavedAt: string | null;}) {
  if (state === 'error') {
    return (
      <span className="ml-1 inline-flex items-center gap-1 text-xs text-danger" role="status">
        <CloudOffIcon className="h-3.5 w-3.5" aria-hidden /> Not saved: browser storage failed
      </span>);

  }
  if (state === 'unsaved') {
    return (
      <span className="ml-1 inline-flex items-center gap-1 text-xs text-ink-subtle" role="status">
        <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
      </span>);

  }
  return (
    <span className="ml-1 hidden items-center gap-1 text-xs text-ink-subtle xl:inline-flex" role="status" title="Saved in this browser's local storage">
      <CheckCircle2Icon className="h-3.5 w-3.5" aria-hidden /> Saved locally{lastSavedAt ? ` · ${formatRelative(lastSavedAt)}` : ''}
    </span>);

}
