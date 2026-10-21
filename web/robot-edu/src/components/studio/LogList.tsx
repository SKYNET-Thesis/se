import React, { useEffect, useRef } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import type { LogEntry, LogLevel } from '../../types/robotProgram';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../utils/cn';
import { formatClock } from '../../utils/format';

const LEVEL: Record<LogLevel, {label: string;className: string;}> = {
  info: { label: 'INFO', className: 'text-ink-subtle' },
  step: { label: 'STEP', className: 'text-accent' },
  warn: { label: 'WARN', className: 'text-warn' },
  error: { label: 'ERR', className: 'text-danger' },
  success: { label: 'DONE', className: 'text-ok' }
};

interface LogListProps {
  logs: LogEntry[];
  onSelect: (blockId: string) => void;
  onClear: () => void;
}

export function LogList({ logs, onSelect, onClear }: LogListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  if (logs.length === 0) {
    return <EmptyState compact icon={<TerminalSquareIcon />} title="No execution logs yet" description="Run the simulation to see each step as it happens." />;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-1.5">
        <span className="text-2xs text-ink-subtle">{logs.length} entries · simulation</span>
        <button type="button" onClick={onClear} className="rounded px-1.5 py-0.5 text-2xs font-medium text-ink-muted hover:bg-sunken hover:text-ink">
          Clear
        </button>
      </div>
      <ol className="py-1 font-mono text-xs" aria-live="polite">
        {logs.map((l) => {
          const lvl = LEVEL[l.level];
          const row =
          <>
              <span className="tabular w-14 shrink-0 text-ink-subtle">{formatClock(l.t)}</span>
              <span className={cn('w-9 shrink-0 font-medium', lvl.className)}>{lvl.label}</span>
              <span className={cn('min-w-0 flex-1 break-words', l.level === 'error' ? 'text-danger' : 'text-ink')}>{l.message}</span>
            </>;

          return (
            <li key={l.id}>
              {l.blockId ?
              <button type="button" onClick={() => onSelect(l.blockId as string)} className="flex w-full gap-2 px-4 py-1 text-left hover:bg-sunken">
                  {row}
                </button> :

              <div className="flex gap-2 px-4 py-1">{row}</div>
              }
            </li>);

        })}
      </ol>
      <div ref={endRef} />
    </div>);

}