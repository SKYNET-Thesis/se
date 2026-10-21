import React from 'react';
import { Link } from 'react-router-dom';
import { InboxIcon, LibraryIcon, PlusIcon } from 'lucide-react';
import { useLearning } from '../../contexts/LearningContext';
import { demoPersonas } from '../../data/demoPersonas';
import { PageHeader } from '../../components/ui/PageHeader';
import { DemoNotice } from '../../components/ui/DemoNotice';
import { LinkButton } from '../../components/ui/LinkButton';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { describeDue, formatRelative } from '../../utils/format';

export function TeacherOverview() {
  const { submissions, assignments, courses, getAssignment } = useLearning();
  const pending = submissions.filter((s) => !s.review).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const upcoming = [...assignments].filter((a) => new Date(a.dueDate).getTime() >= Date.now() - 86_400_000).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title={`Welcome back, ${demoPersonas.teacher.firstName}`}
        description="Review student work, adjust course content and set new programming tasks."
        actions={
        <>
            <LinkButton to="/teacher/courses" icon={<LibraryIcon className="h-4 w-4" />}>
              Manage courses
            </LinkButton>
            <LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" />}>
              New assignment
            </LinkButton>
          </>
        } />
      
      <DemoNotice className="mt-6">
        Teacher tools are a functional prototype. Courses, assignments and reviews are saved in this browser's demo storage, and student submissions shown here are demo records or local drafts
        from this browser.
      </DemoNotice>

      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="review-heading">
          <SectionHeading
            id="review-heading"
            title={`Needs review (${pending.length})`}
            action={
            <Link to="/teacher/submissions" className="font-medium text-accent hover:text-accent-hover">
                All submissions
              </Link>
            } />
          
          {pending.length === 0 ?
          <EmptyState compact icon={<InboxIcon />} title="Nothing waiting for review" /> :

          <ul className="divide-y divide-line border-y border-line">
              {pending.slice(0, 5).map((s) =>
            <li key={s.id}>
                  <Link to={`/teacher/submissions?id=${s.id}`} className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 hover:bg-sunken/70">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{s.studentName}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {getAssignment(s.assignmentId)?.title ?? 'Removed assignment'} · {formatRelative(s.submittedAt)}
                      </p>
                    </div>
                    <Badge tone={s.lastRunOutcome === 'completed' ? 'ok' : s.lastRunOutcome === 'failed' ? 'danger' : 'neutral'}>
                      {s.lastRunOutcome === 'not_run' ? 'Not simulated' : `Run ${s.lastRunOutcome}`}
                    </Badge>
                  </Link>
                </li>
            )}
            </ul>
          }
        </section>

        <section aria-labelledby="due-heading">
          <SectionHeading id="due-heading" title="Coming due" />
          <ul className="divide-y divide-line border-y border-line">
            {upcoming.map((a) => {
              const count = submissions.filter((s) => s.assignmentId === a.id).length;
              return (
                <li key={a.id}>
                  <Link to={`/teacher/assignments/${a.id}/edit`} className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 hover:bg-sunken/70">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-ink-subtle">{describeDue(a.dueDate).label}</p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-ink-muted">
                      {count} submission{count === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>);

            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="teacher-courses-heading" className="mt-12">
        <SectionHeading id="teacher-courses-heading" title="Your courses" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-subtle">
                <th className="py-2 pr-4 font-medium">Course</th>
                <th className="py-2 pr-4 font-medium">Level</th>
                <th className="py-2 pr-4 text-right font-medium">Lessons</th>
                <th className="py-2 pr-4 text-right font-medium">Assignments</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {courses.map((c) =>
              <tr key={c.id}>
                  <td className="py-3 pr-4">
                    <Link to={`/teacher/courses?id=${c.id}`} className="font-medium text-ink hover:text-accent">
                      {c.code} · {c.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{c.level}</td>
                  <td className="tabular py-3 pr-4 text-right text-ink-muted">{c.lessons.length}</td>
                  <td className="tabular py-3 pr-4 text-right text-ink-muted">{assignments.filter((a) => a.courseId === c.id).length}</td>
                  <td className="py-3 text-right">
                    <Badge tone={c.published ? 'ok' : 'outline'}>{c.published ? 'Published' : 'Draft'}</Badge>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>);

}