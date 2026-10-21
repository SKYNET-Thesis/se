import React from 'react';
import type { RobotCommand } from '../../types/robotProgram';
import { describeCommand } from '../../utils/robotProgram/describe';

interface CommandTreeProps {
  commands: RobotCommand[];
  onSelect?: (blockId: string) => void;
  depth?: number;
}

/** Human-readable outline of a structured RobotProgram. */
export function CommandTree({ commands, onSelect, depth = 0 }: CommandTreeProps) {
  return (
    <ol className={depth === 0 ? 'space-y-0.5' : 'mt-0.5 space-y-0.5 border-l border-line pl-3'}>
      {commands.map((c, i) =>
      <li key={`${c.blockId}-${i}`}>
          <button
          type="button"
          onClick={() => onSelect?.(c.blockId)}
          disabled={!onSelect}
          className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-[13px] text-ink enabled:hover:bg-sunken">
          
            <span className="tabular w-5 shrink-0 text-right font-mono text-2xs text-ink-subtle">{i + 1}</span>
            <span>{describeCommand(c)}</span>
          </button>
          {c.op === 'repeat' && <CommandTree commands={c.body} onSelect={onSelect} depth={depth + 1} />}
          {c.op === 'if' &&
        <div className="ml-7">
              <p className="mt-0.5 text-2xs font-medium text-ink-subtle">then</p>
              {c.then.length ? <CommandTree commands={c.then} onSelect={onSelect} depth={depth + 1} /> : <p className="pl-3 text-xs text-ink-subtle">nothing</p>}
              <p className="mt-0.5 text-2xs font-medium text-ink-subtle">else</p>
              {c.else.length ? <CommandTree commands={c.else} onSelect={onSelect} depth={depth + 1} /> : <p className="pl-3 text-xs text-ink-subtle">nothing</p>}
            </div>
        }
        </li>
      )}
    </ol>);

}