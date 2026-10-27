import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { LESSON_ONE } from '../../home/content/lessonOne';
import { BLOCKS, checkRules, describeStep, LESSON_ONE_PROGRAM } from '../../home-lab/lessonProgram';
import { partsShown } from './loopModel';

const RULES = checkRules(LESSON_ONE_PROGRAM);
const STEP = (i: number) => describeStep(BLOCKS[LESSON_ONE_PROGRAM[i]].step);
/**
 * What each rule reads in the preview trace, as checkRules reads it: the arm is selected before any
 * gripper step; an open comes before a close; the last state has the jaw closed.
 */
const EVIDENCE = [`step 1  ${STEP(0)}`, `steps 2 and 4  ${STEP(1)}, ${STEP(3)}`, 'after step 4  jaw: closed'];

/** How many parts each step reveals as the reader scrolls through it (Learn and Reflect have none). */
export const STEP_PARTS = [0, LESSON_ONE_PROGRAM.length, LESSON_ONE_PROGRAM.length, RULES.length, 0] as const;

const label = 'text-[14px] font-semibold text-[var(--v2-teal)]';

/**
 * The thread: one dark layer that stays beside the frame through all five steps and carries lesson
 * one along: what it asks for, the steps its blocks compile to, the preview playing them, what each
 * rule reads in the trace, and what is submitted. It adds to the screen rather than repeating it. Its
 * parts arrive with the scroll (or complete at once when a step is chosen). An illustration of the
 * loop; nothing here runs a robot.
 */
export function LoopThread({ step, local, className }: { step: number; local: number; className?: string }) {
  const shown = partsShown(local, STEP_PARTS[step] ?? 0);
  const passed = RULES.filter((r) => r.passed).length;
  return (
    <div className={cn('rounded-[3px] bg-[var(--v2-void)] p-[clamp(14px,1.4vw,22px)]', className)}>
      <div key={step} className="v2-loop-in v2-thread-grid grid gap-2.5">
        {step === 0 && (
          <>
            <p className={label}>Lesson 1: Open &amp; Close Gripper</p>
            <p className="text-[16px] leading-[1.45]">Place {LESSON_ONE_PROGRAM.length} blocks, preview every step, and pass {RULES.length} rules.</p>
          </>
        )}

        {step === 1 && (
          <>
            <p className={label}>Each block compiles to one step</p>
            <ol aria-label="Lesson one, compiled" className="v2-thread-steps grid gap-1">
              {LESSON_ONE_PROGRAM.map((kind, i) => (
                <li key={kind + i} className={cn('v2-loop-part grid grid-cols-[10px_1fr] items-center gap-2.5', i < shown ? 'is-on' : 'opacity-25')}>
                  <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: BLOCKS[kind].color }} />
                  <code className="v2-mono truncate text-[13px] text-[var(--v2-soft)]">{STEP(i)}</code>
                </li>
              ))}
            </ol>
          </>
        )}

        {step === 2 && (
          <>
            <p className={label}>Preview, step {Math.max(1, shown)} of {LESSON_ONE_PROGRAM.length}</p>
            <div className="grid grid-cols-4 gap-1" aria-hidden>
              {LESSON_ONE.map((s, i) => <span key={s.id} className="v2-loop-part h-[5px] rounded-full" style={{ backgroundColor: i < shown ? s.color : 'rgba(238,242,240,0.12)' }} />)}
            </div>
            <p className="text-[16px] leading-[1.45]">{LESSON_ONE[Math.max(0, shown - 1)].result}</p>
          </>
        )}

        {step === 3 && (
          <>
            <p className={label}>What each rule reads in the trace</p>
            <ul className="v2-thread-rules grid gap-2">
              {RULES.map((r, i) => (
                <li key={r.rule} className={cn('v2-loop-part grid grid-cols-[16px_1fr] gap-x-2', i < shown ? 'is-on' : 'opacity-25')}>
                  {r.passed ? <CheckIcon className="mt-0.5 h-4 w-4 text-[var(--v2-teal)]" aria-hidden /> : <XIcon className="mt-0.5 h-4 w-4" aria-hidden />}
                  <span className="text-[15px] leading-[1.35]">{r.rule}<span className="sr-only">{r.passed ? ', passed' : ', not passed'}</span></span>
                  {/* On phones the outcomes alone, so the stage keeps one height; the trace evidence from sm up. */}
                  <code className="v2-mono col-start-2 text-[13px] leading-[1.4] text-[var(--v2-muted)] max-sm:hidden">{EVIDENCE[i]}</code>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 4 && (
          <>
            <p className={label}>Submitted</p>
            <p className="text-[16px] leading-[1.45]">{LESSON_ONE_PROGRAM.length} blocks, {LESSON_ONE_PROGRAM.length} preview steps, {passed} of {RULES.length} rules passed. Then the teacher’s feedback, and your reflection on it.</p>
          </>
        )}
      </div>
    </div>
  );
}
