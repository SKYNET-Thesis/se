import React from 'react';
import type { ProgramRecord } from '../../types/robotProgram';
import type { InspectorTab, StudioController } from '../../hooks/useStudioController';
import { Tabs } from '../ui/Tabs';
import { LogList } from './LogList';
import { ProblemsList } from './ProblemsList';
import { ProgramOutput } from './ProgramOutput';
import { TaskPanel } from './TaskPanel';

interface InspectorPanelProps {
  record: ProgramRecord;
  controller: StudioController;
  onExportProgram: () => void;
}

export function InspectorPanel({ record, controller: c, onExportProgram }: InspectorPanelProps) {
  const problems = c.generation?.problems;
  const errors = problems?.filter((p) => p.severity === 'error').length ?? 0;
  const items: Array<{id: InspectorTab;label: string;count?: number;tone?: 'danger' | 'warn';}> = [
  { id: 'task', label: record.assignmentId ? 'Task' : 'Reference' },
  { id: 'problems', label: 'Problems', count: problems?.length ?? 0, tone: errors ? 'danger' : 'warn' },
  { id: 'logs', label: 'Logs', count: c.logs.length },
  { id: 'output', label: 'Output' }];


  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs label="Inspector" size="sm" items={items} value={c.tab} onChange={c.setTab} className="px-2" />
      <div role="tabpanel" id={`panel-${c.tab}`} aria-labelledby={`tab-${c.tab}`} className="min-h-0 flex-1 overflow-y-auto">
        {c.tab === 'task' && <TaskPanel record={record} generation={c.generation} lastRun={c.lastRun} />}
        {c.tab === 'problems' && <ProblemsList problems={problems} onSelect={c.goToBlock} />}
        {c.tab === 'logs' && <LogList logs={c.logs} onSelect={c.goToBlock} onClear={c.clearLogs} />}
        {c.tab === 'output' && <ProgramOutput generation={c.generation} onExport={onExportProgram} />}
      </div>
    </div>);

}