import React from 'react';
import { AlertTriangleIcon, CheckCircle2Icon, CircleXIcon, CornerDownRightIcon } from 'lucide-react';
import type { Problem } from '../../types/robotProgram';
import { EmptyState } from '../ui/EmptyState';

interface ProblemsListProps {
  problems: Problem[] | undefined;
  onSelect: (blockId: string) => void;
}

export function ProblemsList({ problems, onSelect }: ProblemsListProps) {
  if (!problems) return <p className="px-4 py-6 text-sm text-ink-muted">Checking the program…</p>;
  if (problems.length === 0) {
    return <EmptyState compact icon={<CheckCircle2Icon className="text-ok" />} title="No problems found" description="The program is valid and ready to simulate." />;
  }
  return (
    <ul className="divide-y divide-line">
      {problems.map((p) => {
        const Icon = p.severity === 'error' ? CircleXIcon : AlertTriangleIcon;
        const content =
        <>
            <Icon className={p.severity === 'error' ? 'mt-0.5 h-4 w-4 shrink-0 text-danger' : 'mt-0.5 h-4 w-4 shrink-0 text-warn'} aria-label={p.severity} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">{p.message}</span>
              {p.hint && <span className="mt-0.5 block text-xs text-ink-muted">{p.hint}</span>}
              {p.blockId &&
            <span className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-accent">
                  <CornerDownRightIcon className="h-3 w-3" aria-hidden /> Show block
                </span>
            }
            </span>
          </>;

        return (
          <li key={p.id}>
            {p.blockId ?
            <button type="button" onClick={() => onSelect(p.blockId as string)} className="flex w-full gap-2.5 px-4 py-3 text-left hover:bg-sunken">
                {content}
              </button> :

            <div className="flex gap-2.5 px-4 py-3">{content}</div>
            }
          </li>);

      })}
    </ul>);

}