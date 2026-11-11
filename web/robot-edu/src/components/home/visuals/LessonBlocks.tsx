import type { ReactNode } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Static replica of lesson one ("Open & Close Gripper") as students build it in Practice.
 * Labels and colours mirror blocklyConfig.ts; this is not a live Blockly workspace.
 */
export const LESSON_ONE_STEPS = [
  { id: 'select', short: 'Select arm', summary: 'The left arm is selected.', jaw: 'closed' },
  { id: 'open', short: 'Open', summary: 'The gripper opens.', jaw: 'open' },
  { id: 'wait', short: 'Wait 1 s', summary: 'The arm holds for one second.', jaw: 'open' },
  { id: 'close', short: 'Close', summary: 'The gripper closes.', jaw: 'closed' },
] as const;

export type LessonStep = (typeof LESSON_ONE_STEPS)[number];

// From blocklyConfig PALETTE. Gripper amber is darkened slightly so white text meets 4.5:1.
const COLOR = { start: '#2B2F35', dual: '#7A4F8F', gripper: '#94600F', timing: '#5B6573' } as const;

function Field({ children }: { children: string }) {
  return <span className="mx-1 inline-flex h-7 items-center rounded-[8px] bg-white/20 px-2.5 text-[14px] font-semibold">{children}</span>;
}

function Block({ color, active, children, className }: { color: string; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      aria-current={active ? 'step' : undefined}
      className={cn('relative flex min-h-11 items-center rounded-[10px] px-4 text-[15px] font-semibold text-white transition-[box-shadow,transform] duration-200', active && 'shadow-[0_0_0_3px_var(--vh-surface),0_0_0_6px_var(--vh-teal)]', className)}
      style={{ backgroundColor: color }}>
      {children}
    </div>
  );
}

export function LessonBlocks({ activeIndex }: { activeIndex: number | null }) {
  const active = (id: LessonStep['id']) => activeIndex !== null && LESSON_ONE_STEPS[activeIndex].id === id;
  return (
    <div aria-label="Lesson one program, shown as blocks" role="group" className="select-none">
      <Block color={COLOR.start} className="w-fit rounded-t-[18px] pr-6">when program starts</Block>
      <div className="mt-1">
        <Block color={COLOR.dual} active={active('select')} className="w-fit rounded-b-none pr-6">use <Field>left</Field> arm</Block>
        <div className="flex">
          <div className="w-5 shrink-0" style={{ backgroundColor: COLOR.dual }} aria-hidden />
          <div className="flex flex-col gap-1 py-1 pl-1">
            <Block color={COLOR.gripper} active={active('open')} className="w-fit">open gripper</Block>
            <Block color={COLOR.timing} active={active('wait')} className="w-fit">wait <Field>1</Field> seconds</Block>
            <Block color={COLOR.gripper} active={active('close')} className="w-fit">close gripper</Block>
          </div>
        </div>
        <div className="h-5 w-28 rounded-b-[10px] rounded-tr-[10px]" style={{ backgroundColor: COLOR.dual }} aria-hidden />
      </div>
    </div>
  );
}
