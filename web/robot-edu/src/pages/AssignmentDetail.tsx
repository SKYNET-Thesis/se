import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeftIcon, CircleDashedIcon, FileQuestionIcon, UserCheckIcon, CheckIcon } from 'lucide-react';
import { useLearning } from '../contexts/LearningContext';
import { AssignmentWorkPanel } from '../components/assignments/AssignmentWorkPanel';
import { DemoTag } from '../components/ui/DemoTag';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';
import { describeCheck } from '../utils/robotProgram/criteria';
import { describeDue, formatDate } from '../utils/format';
import { cn } from '../utils/cn';

export function AssignmentDetail() {
  const { assignmentId = '' } = useParams();
  const { getAssignment, getCourse } = useLearning();
  const assignment = getAssignment(assignmentId);

  if (!assignment) {
    return <EmptyState icon={<FileQuestionIcon />} title="Assignment not found" action={<LinkButton to="/assignments">All assignments</LinkButton>} />;
  }

  const course = getCourse(assignment.courseId);
  const lesson = course?.lessons.find((l) => l.id === assignment.lessonId);
  const due = describeDue(assignment.dueDate);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-9">
      <Link to="/assignments" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
        <ChevronLeftIcon className="h-4 w-4" aria-hidden /> Assignments
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            {course &&
            <Link to={`/courses/${course.id}`} className="font-medium text-ink hover:text-accent">
                {course.code}
              </Link>
            }
            {lesson &&
            <>
                <span aria-hidden>·</span>
                <Link to={`/courses/${assignment.courseId}/lessons/${lesson.id}`} className="hover:text-ink">
                  {lesson.title}
                </Link>
              </>
            }
            <DemoTag />
          </div>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">{assignment.title}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">{assignment.summary}</p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-b border-line pb-6 text-[13px]">
            <div>
              <dt className="text-ink-subtle">Due</dt>
              <dd className={cn('font-medium', due.tone === 'danger' ? 'text-danger' : due.tone === 'warn' ? 'text-warn' : 'text-ink')}>{formatDate(assignment.dueDate, 'EEE, MMM d · h:mm a')}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Points</dt>
              <dd className="font-medium text-ink">{assignment.points}</dd>
            </div>
          </dl>

          <section aria-labelledby="instructions-heading" className="mt-7">
            <h2 id="instructions-heading" className="text-lg font-semibold text-ink">
              Instructions
            </h2>
            <ol className="mt-3 space-y-3">
              {assignment.instructions.map((step, i) =>
              <li key={step} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
                  <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink-muted">{i + 1}</span>
                  {step}
                </li>
              )}
            </ol>
          </section>

          <section aria-labelledby="objectives-heading" className="mt-9">
            <h2 id="objectives-heading" className="text-lg font-semibold text-ink">
              Learning objectives
            </h2>
            <ul className="mt-3 space-y-2">
              {assignment.objectives.map((o) =>
              <li key={o} className="flex gap-2.5 text-[15px] text-ink/90">
                  <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
                  {o}
                </li>
              )}
            </ul>
          </section>

          <section aria-labelledby="criteria-heading" className="mt-9">
            <h2 id="criteria-heading" className="text-lg font-semibold text-ink">
              Completion criteria
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">Automatic checks update live in the Studio's Task tab.</p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {assignment.criteria.map((c) =>
              <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[15px] text-ink">{c.text}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-subtle">
                    {c.check.kind === 'manual' ? <UserCheckIcon className="h-3.5 w-3.5" aria-hidden /> : <CircleDashedIcon className="h-3.5 w-3.5" aria-hidden />}
                    {describeCheck(c)}
                  </span>
                </li>
              )}
            </ul>
          </section>
        </article>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <AssignmentWorkPanel assignment={assignment} />
        </aside>
      </div>
    </div>);

}