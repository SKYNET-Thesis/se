import type { ReactNode } from 'react';
import { CheckIcon, LockIcon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { BLOCKS, describeStep, LESSON_ONE_PROGRAM } from '../../home-lab/lessonProgram';
import { episodeLength, followerPose, type Sample } from './model';

/** One line on the stage saying what this view really is. */
export function StageNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('inline-flex items-center gap-1.5 rounded-[4px] bg-[rgb(8_9_10/0.85)] px-2 py-1 text-[13px] text-[var(--v2-soft)]', className)}>{children}</p>;
}

export const LockNote = ({ className }: { className?: string }) => (
  <StageNote className={className}><LockIcon className="h-3.5 w-3.5" aria-hidden />Physical robot locked</StageNote>
);

/** Lesson one's real blocks, each with the canonical step it compiles to; the active one is playing. */
export function ProgramTrace({ index, className }: { index: number; className?: string }) {
  return (
    <ol aria-label="Lesson one: each block and the step it compiles to" className={cn('grid gap-1.5 max-lg:grid-cols-2', className)}>
      {LESSON_ONE_PROGRAM.map((kind, i) => {
        const b = BLOCKS[kind]; const on = i === index; const done = index > i;
        return (
          <li key={kind + i} aria-current={on ? 'step' : undefined}
            className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] px-2 py-1.5 transition-[background-color,opacity] duration-300 max-lg:grid-cols-[1fr_auto] max-lg:gap-1 max-lg:px-1.5 max-lg:py-1', on ? 'bg-[rgb(8_9_10/0.90)]' : 'bg-[rgb(8_9_10/0.60)]', !on && !done && index >= 0 && 'opacity-60')}>
            <span className="inline-flex h-8 items-center rounded-[5px] px-2.5 text-[13px] font-semibold text-white" style={{ backgroundColor: b.color }}>{b.label}</span>
            <code className={cn('v2-mono truncate text-[13px] max-lg:hidden', on ? 'text-[var(--v2-teal)]' : 'text-[var(--v2-soft)]')}>{describeStep(b.step)}</code>
            <span className="w-4">{done && <CheckIcon className="h-4 w-4 text-[var(--v2-teal)]" aria-label="done" />}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * An episode as two lanes over time. "Commanded" is the hand you moved on this page. The second lane
 * is the preview pose the simulated follower took; in a real episode that lane holds what the robot
 * measured. Nothing here is a sensor reading.
 */
export function EpisodeLanes({ samples, cursor, recording, illustrative, className }: { samples: Sample[]; cursor: number; recording: boolean; illustrative: boolean; className?: string }) {
  const total = Math.max(episodeLength(samples), 1);
  const line = (f: (s: Sample) => number) => samples.map((s, i) => `${i ? 'L' : 'M'} ${(s.t / total) * 100} ${f(s)}`).join(' ');
  const x = (cursor / total) * 100;
  const lane = (label: string, hint: string, children: ReactNode) => (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3 max-sm:grid-cols-[92px_1fr]">
      <p className="text-[13px] font-semibold leading-tight text-[var(--v2-soft)]">{label}<span className="block font-normal text-[var(--v2-muted)]">{hint}</span></p>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-10 w-full overflow-visible max-sm:h-7" aria-hidden>
        {children}
        {cursor > 0 && <line x1={x} x2={x} y1={0} y2={24} stroke="var(--v2-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
  const seconds = (episodeLength(samples) / 1000).toFixed(1);
  return (
    <div className={cn('grid gap-2 rounded-[6px] bg-[rgb(8_9_10/0.88)] p-3 max-sm:gap-1 max-sm:p-2', className)}>
      {lane('Commanded', 'your hand', <>
        <path d={line((s) => 12 - s.x * 14)} fill="none" stroke="var(--v2-teal)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={line((s) => 12 + s.y * 14)} fill="none" stroke="rgba(238,242,240,0.55)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </>)}
      {lane('Preview pose', 'simulated', <>
        <path d={line((s) => 12 - followerPose(s).Rotation * 13)} fill="none" stroke="#e0b25a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={line((s) => 12 - (followerPose(s).Pitch + 0.68) * 18)} fill="none" stroke="rgba(238,242,240,0.55)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </>)}
      <p className="v2-num text-[13px] text-[var(--v2-soft)]" aria-live="polite">
        {recording ? `Recording your hand, ${seconds} s`
          : illustrative ? `Illustrative episode, ${seconds} s. Record your own to replace it.`
            : `Your episode, ${seconds} s, ${samples.length} samples. Kept on this page only; nothing is saved or sent.`}
      </p>
      <p className="text-[13px] text-[var(--v2-soft)] max-sm:hidden">In a real episode the second lane holds what the robot measured. This page has no robot, so it shows the simulated preview instead.</p>
    </div>
  );
}
