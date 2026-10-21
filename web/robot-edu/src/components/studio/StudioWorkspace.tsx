import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon } from 'lucide-react';
import type { ProgramRecord } from '../../types/robotProgram';
import { usePrograms } from '../../contexts/ProgramsContext';
import { useProgramActions } from '../../hooks/useProgramActions';
import { useStudioController } from '../../hooks/useStudioController';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { BlocklyCanvas } from './BlocklyCanvas';
import { InspectorPanel } from './InspectorPanel';
import { NewProgramDialog } from './NewProgramDialog';
import { PreviewDialog } from './PreviewDialog';
import { RealRobotDialog } from './RealRobotDialog';
import { SimulationPanel } from './SimulationPanel';
import { StudioToolbar } from './StudioToolbar';

const MIN_W = 340;
const MAX_W = 640;

export function StudioWorkspace({ record }: {record: ProgramRecord;}) {
  const navigate = useNavigate();
  const { programs } = usePrograms();
  const controller = useStudioController(record);
  const actions = useProgramActions(record, controller);
  const [panelWidth, setPanelWidth] = useState(420);
  const [simCollapsed, setSimCollapsed] = useState(false);
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setPanelWidth(Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX)));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onSeparatorKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setPanelWidth((w) => Math.min(MAX_W, w + 24));
    if (e.key === 'ArrowRight') setPanelWidth((w) => Math.max(MIN_W, w - 24));
  };

  const handleLoadError = useCallback((message: string | null) => controller.setLoadError(message), [controller]);

  return (
    <div className="flex h-full flex-col bg-surface">
      <StudioToolbar
        record={record}
        programs={programs}
        controller={controller}
        renameSignal={actions.renameSignal}
        onRename={actions.rename}
        onOpenProgram={(id) => navigate(`/studio/${id}`)}
        onNew={() => actions.setDialog('new')}
        onDuplicate={actions.duplicate}
        onRequestRename={actions.requestRename}
        onDelete={() => actions.setDialog('delete')}
        onImport={actions.openImport}
        onExportFile={actions.exportFile}
        onExportProgram={actions.exportProgram}
        onPreview={() => {
          controller.regenerate();
          actions.setDialog('preview');
        }}
        onRealRobot={() => actions.setDialog('robot')} />
      

      {controller.loadError &&
      <div role="alert" className="flex items-center gap-2 border-b border-line bg-danger-soft px-4 py-2 text-[13px] text-danger">
          <AlertTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
          This program's saved blocks could not be loaded ({controller.loadError}). The canvas was cleared; saving will overwrite the damaged copy.
        </div>
      }

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <BlocklyCanvas
            key={record.id}
            initialState={record.workspace}
            onReady={controller.handleReady}
            onChange={controller.handleChange}
            onBeforeDispose={controller.handleBeforeDispose}
            onLoadError={handleLoadError} />
          
          {controller.run.status === 'running' &&
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-pop">
              Simulation running · edits apply to the next run
            </div>
          }
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector panel"
          aria-valuenow={panelWidth}
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onSeparatorKey}
          className="group relative w-px shrink-0 cursor-col-resize bg-line">
          
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
          <span className="absolute inset-y-0 left-0 w-px bg-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
        </div>

        <aside aria-label="Inspector" className="flex min-h-0 shrink-0 flex-col bg-surface" style={{ width: panelWidth }}>
          <SimulationPanel
            state={controller.simState}
            run={controller.run}
            speed={controller.simSpeed}
            onSpeedChange={controller.setSimSpeed}
            onReset={controller.resetSimulation}
            collapsed={simCollapsed}
            onToggle={() => setSimCollapsed((v) => !v)} />
          
          <InspectorPanel record={record} controller={controller} onExportProgram={actions.exportProgram} />
        </aside>
      </div>

      <input
        ref={actions.fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void actions.importFile(file);
          e.target.value = '';
        }} />
      
      <NewProgramDialog open={actions.dialog === 'new'} onClose={() => actions.setDialog(null)} onCreate={actions.create} />
      <ConfirmDialog
        open={actions.dialog === 'delete'}
        title={`Delete “${record.name}”?`}
        description="This removes the program from this browser. It cannot be undone. Export it first if you want a copy."
        confirmLabel="Delete program"
        onConfirm={actions.confirmDelete}
        onCancel={() => actions.setDialog(null)} />
      
      <PreviewDialog open={actions.dialog === 'preview'} onClose={() => actions.setDialog(null)} generation={controller.generation} onSelectBlock={controller.goToBlock} />
      <RealRobotDialog open={actions.dialog === 'robot'} onClose={() => actions.setDialog(null)} />
    </div>);

}