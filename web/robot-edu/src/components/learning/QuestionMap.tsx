import { CheckIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Numbered map of a quiz's questions: which are answered, which are not, and a jump to any of them. It only reads
 * the learner's own selections (never a grading key) and changes nothing about drafts, scoring or submission.
 * Concept from the A06 quiz work of ttjendatgit (PRs #153 and #162), rebuilt on the current VISTA tokens.
 */
export function QuestionMap({ questions, answered, onSelect, disabled }: { questions: Array<{ id: string }>; answered: (id: string) => boolean; onSelect: (index: number) => void; disabled?: boolean }) {
  const done = questions.filter((question) => answered(question.id)).length;
  const missing = questions.length - done;
  return (
    <nav aria-label="Questions" className="mt-6 rounded-xl border border-line bg-surface p-4" data-testid="question-map">
      <p className="text-sm text-ink-muted" aria-live="polite" data-testid="question-map-summary">
        <span className="font-semibold text-ink">{done} of {questions.length} answered</span>
        {missing > 0 ? ` · ${missing} still to answer before you can submit` : ' · ready to submit'}
      </p>
      <ol className="mt-3 flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const isDone = answered(question.id);
          return (
            <li key={question.id}>
              <button type="button" disabled={disabled} onClick={() => onSelect(index)} aria-label={`Question ${index + 1}, ${isDone ? 'answered' : 'not answered'}`}
                className={cn('relative inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60',
                  isDone ? 'border-accent bg-accent-soft text-accent-ink' : 'border-dashed border-line-strong text-ink-muted hover:bg-sunken hover:text-ink')}>
                {index + 1}
                {isDone && <CheckIcon className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-accent p-0.5 text-white" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
