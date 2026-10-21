import React from 'react';
import { ChevronDownIcon, RotateCcwIcon } from 'lucide-react';
import type { ArmId, SimState } from '../../types/robotProgram';
import type { RunInfo } from '../../hooks/useStudioController';
import { IconButton } from '../ui/IconButton';
import { ProgressBar } from '../ui/ProgressBar';
import { StatusDot, type StatusTone } from '../ui/StatusDot';
import { So101Viewer3D } from './So101Viewer3D';
import { StudioViewerBoundary } from './StudioViewerBoundary';
import { cn } from '../../utils/cn';

interface SimulationPanelProps {
  state: SimState;
  run: RunInfo;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

const STATUS: Record<RunInfo['status'], {label: string;tone: StatusTone;}> = {
  idle: { label: 'Ready', tone: 'unknown' },
  running: { label: 'Running', tone: 'active' },
  completed: { label: 'Completed', tone: 'ok' },
  stopped: { label: 'Stopped', tone: 'warn' },
  failed: { label: 'Failed', tone: 'danger' }
};

export function SimulationPanel({ state, run, speed, onSpeedChange, onReset, collapsed, onToggle }: SimulationPanelProps) {
  const running = run.status === 'running';
  const status = STATUS[run.status];
  const pct = run.total ? run.step / run.total * 100 : 0;

  return (
    <section aria-label="Local schematic preview" className="shrink-0 border-b border-line">
      <div className="flex h-10 items-center gap-2 px-3">
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-[13px] font-semibold text-ink hover:bg-sunken">
          <ChevronDownIcon className={cn('h-3.5 w-3.5 text-ink-subtle transition-transform duration-150', collapsed && '-rotate-90')} aria-hidden />
          Local robot preview
        </button>
        <span className="rounded border border-line px-1.5 text-2xs font-medium text-ink-subtle">SO-101 3D</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <StatusDot tone={status.tone} className={running ? 'animate-pulse' : undefined} />
          {status.label}
          {run.total > 0 &&
          <span className="tabular text-ink-subtle">
              · {Math.min(run.step, run.total)}/{run.total}
            </span>
          }
        </span>
      </div>

      {!collapsed &&
      <>
          <div className="relative mx-3 aspect-[648/486] max-h-[360px] overflow-hidden rounded-md border border-line bg-canvas">
            <StudioViewerBoundary key="so101-viewer-ready-v2"><So101Viewer3D state={state} /></StudioViewerBoundary>
          </div>
          <div className="space-y-2.5 px-3 pb-3 pt-2.5">
            <ProgressBar value={run.status === 'completed' ? 100 : pct} label="Simulation progress" />
            <p className="truncate font-mono text-xs text-ink-muted" aria-live="polite">
              {run.label || 'Browser-only visual preview. It does not call a simulator or robot.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'right'] as ArmId[]).map((arm) =>
            <ArmReadout key={arm} arm={arm} state={state} />
            )}
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <div role="radiogroup" aria-label="Playback speed" className="flex rounded-md bg-sunken p-0.5">
                {[1, 2, 4].map((s) =>
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={speed === s}
                disabled={running}
                onClick={() => onSpeedChange(s)}
                className={cn('tabular h-6 w-9 rounded text-xs font-medium disabled:opacity-50', speed === s ? 'bg-surface text-ink shadow-hairline' : 'text-ink-muted hover:text-ink')}>
                
                    {s}×
                  </button>
              )}
              </div>
              <IconButton label="Reset simulation" size="sm" onClick={onReset} disabled={running}>
                <RotateCcwIcon />
              </IconButton>
            </div>
            <p className="text-2xs leading-4 text-ink-subtle">Schematic only: not to scale, no physics, collision checking, backend simulation, or robot command.</p>
          </div>
        </>
      }
    </section>);

}

function ArmReadout({ arm, state }: {arm: ArmId;state: SimState;}) {
  const a = state.arms[arm];
  const held = a.holding ? state.objects.find((o) => o.id === a.holding)?.label : null;
  return (
    <div className="rounded-md bg-sunken/70 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold capitalize text-ink">{arm} arm</span>
        <span className={cn('text-2xs font-medium', a.busy ? 'text-accent' : 'text-ink-subtle')}>{a.busy ? 'Moving' : 'Idle'}</span>
      </div>
      <p className="tabular mt-1 font-mono text-2xs text-ink-muted">
        {Math.round(a.tool.x)}, {Math.round(a.tool.y)}, {Math.round(a.tool.z)} mm
      </p>
      <p className="mt-0.5 truncate text-2xs text-ink-muted">
        Gripper {a.gripper}
        {held ? ` · ${held.toLowerCase()}` : ''}
      </p>
    </div>);

}
