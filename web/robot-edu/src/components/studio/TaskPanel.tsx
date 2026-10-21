import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRightIcon, CheckCircle2Icon, CircleDashedIcon, CircleIcon, UserCheckIcon, XCircleIcon } from 'lucide-react';
import type { ExecutionResult } from '../../types/robot';
import type { GenerationResult, ProgramRecord } from '../../types/robotProgram';
import { useLearning } from '../../contexts/LearningContext';
import { sceneObjects, sceneZones } from '../../data/simulationScene';
import { describeCheck, evaluateCriterion, type CriterionState } from '../../utils/robotProgram/criteria';
import { describeDue } from '../../utils/format';
import { cn } from '../../utils/cn';

interface TaskPanelProps {
  record: ProgramRecord;
  generation: GenerationResult | null;
  lastRun: ExecutionResult | null;
}

const STATE_ICON: Record<CriterionState, {icon: typeof CircleIcon;className: string;label: string;}> = {
  met: { icon: CheckCircle2Icon, className: 'text-ok', label: 'Met' },
  unmet: { icon: XCircleIcon, className: 'text-danger', label: 'Not met' },
  pending: { icon: CircleDashedIcon, className: 'text-ink-subtle', label: 'Not checked yet' },
  manual: { icon: UserCheckIcon, className: 'text-ink-subtle', label: 'Teacher review' }
};

export function TaskPanel({ record, generation, lastRun }: TaskPanelProps) {
  const { getAssignment } = useLearning();
  const assignment = record.assignmentId ? getAssignment(record.assignmentId) : undefined;

  return (
    <div className="divide-y divide-line">
      {assignment ?
      <section className="space-y-4 p-4">
          <div>
            <p className="text-2xs font-medium text-ink-subtle">{describeDue(assignment.dueDate).label} · {assignment.points} pts</p>
            <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{assignment.title}</h3>
            <p className="mt-1 text-[13px] text-ink-muted">{assignment.summary}</p>
          </div>
          <ol className="space-y-2">
            {assignment.instructions.map((step, i) =>
          <li key={step} className="flex gap-2.5 text-[13px] text-ink">
                <span className="tabular mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-2xs font-semibold text-ink-muted">{i + 1}</span>
                <span>{step}</span>
              </li>
          )}
          </ol>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-ink">Completion criteria</h4>
            <ul className="space-y-1.5">
              {assignment.criteria.map((c) => {
              const state = evaluateCriterion(c, { program: generation?.program ?? null, problems: generation?.problems ?? [], lastRun });
              const s = STATE_ICON[state];
              return (
                <li key={c.id} className="flex items-start gap-2">
                    <s.icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.className)} aria-label={s.label} />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink">{c.text}</span>
                      <span className="block text-2xs text-ink-subtle">{describeCheck(c)}</span>
                    </span>
                  </li>);

            })}
            </ul>
          </div>
          <Link to={`/assignments/${assignment.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover">
            Assignment page and submission <ArrowUpRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section> :

      <section className="p-4">
          <h3 className="text-[13px] font-semibold text-ink">Free practice</h3>
          <p className="mt-1 text-[13px] text-ink-muted">This program is not linked to an assignment. Create a new program from an assignment to see its brief and live checks here.</p>
        </section>
      }

      <section className="space-y-3 p-4">
        <h4 className="text-xs font-semibold text-ink">Workspace reference</h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-ink-muted">Table</dt>
          <dd className="font-mono text-xs text-ink">x 0–600 · y 0–400 · z 10–300 mm</dd>
          <dt className="text-ink-muted">Arm bases</dt>
          <dd className="font-mono text-xs text-ink">L (150, −30) · R (450, −30)</dd>
          <dt className="text-ink-muted">Reach</dt>
          <dd className="font-mono text-xs text-ink">≤ 420 mm from shoulder</dd>
        </dl>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-subtle">
              <th className="pb-1 font-medium">Object / zone</th>
              <th className="pb-1 text-right font-medium">Position</th>
            </tr>
          </thead>
          <tbody className="font-mono text-ink">
            {sceneObjects.map((o) =>
            <tr key={o.id} className="border-t border-line">
                <td className="py-1 font-sans">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: o.color }} aria-hidden />
                  {o.label}
                </td>
                <td className="py-1 text-right">
                  ({o.x}, {o.y})
                </td>
              </tr>
            )}
            {sceneZones.map((z) =>
            <tr key={z.id} className="border-t border-line">
                <td className="py-1 font-sans">{z.label}</td>
                <td className="py-1 text-right">
                  x {z.x}–{z.x + z.w}, y {z.y}–{z.y + z.h}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>);

}