import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { PuzzleIcon } from 'lucide-react';
import { useLearning } from '../contexts/LearningContext';
import { usePrograms } from '../contexts/ProgramsContext';
import { demoPersonas } from '../data/demoPersonas';
import { ContinueLearning } from '../components/dashboard/ContinueLearning';
import { UpcomingAssignments } from '../components/dashboard/UpcomingAssignments';
import { RecentPrograms } from '../components/dashboard/RecentPrograms';
import { RobotStatusSummary } from '../components/robot/RobotStatusSummary';
import { ExperimentList } from '../components/robot/ExperimentList';
import { DemoTag } from '../components/ui/DemoTag';
import { LinkButton } from '../components/ui/LinkButton';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SectionHeading } from '../components/ui/SectionHeading';
import { describeDue } from '../utils/format';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const { courses, assignments, getProgress, courseProgress } = useLearning();
  const { experiments } = usePrograms();
  const dueThisWeek = assignments.filter((a) => {
    const s = getProgress(a.id).status;
    const days = (new Date(a.dueDate).getTime() - Date.now()) / 86_400_000;
    return (s === 'not_started' || s === 'in_progress') && days <= 7;
  });
  const next = [...dueThisWeek].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            {format(new Date(), 'EEEE, MMMM d')}
            <DemoTag />
          </div>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {greeting()}, {demoPersonas.student.firstName}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {dueThisWeek.length === 0 ?
            'Nothing due this week. A good time to experiment in the Studio.' :

            <>
                {dueThisWeek.length} assignment{dueThisWeek.length > 1 ? 's' : ''} due this week.
                {next &&
              <>
                    {' '}Next up:{' '}
                    <Link to={`/assignments/${next.id}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                      {next.title}
                    </Link>
                    , {describeDue(next.dueDate).label.toLowerCase()}.
                  </>
              }
              </>
            }
          </p>
        </div>
        <LinkButton to="/studio" variant="primary" icon={<PuzzleIcon className="h-4 w-4" />}>
          Open Programming Studio
        </LinkButton>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ContinueLearning />
        <UpcomingAssignments />
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        <section aria-labelledby="courses-heading">
          <SectionHeading
            id="courses-heading"
            title="Your courses"
            action={
            <Link to="/courses" className="font-medium text-accent hover:text-accent-hover">
                Catalogue
              </Link>
            } />
          
          <ul className="divide-y divide-line border-y border-line">
            {courses.
            filter((c) => c.published).
            map((c) => {
              const p = courseProgress(c);
              return (
                <li key={c.id}>
                    <Link to={`/courses/${c.id}`} className="-mx-2 block rounded-md px-2 py-3 hover:bg-sunken/70">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-ink">{c.title}</span>
                        <span className="tabular shrink-0 text-xs text-ink-subtle">{p.pct}%</span>
                      </div>
                      <ProgressBar value={p.pct} label={`${c.title} progress`} className="mt-2" tone={p.pct === 100 ? 'ink' : 'accent'} />
                    </Link>
                  </li>);

            })}
          </ul>
        </section>

        <RecentPrograms />

        <div className="space-y-10 md:col-span-2 lg:col-span-1">
          <section aria-labelledby="robot-heading">
            <SectionHeading id="robot-heading" title="Robot status" />
            <RobotStatusSummary />
          </section>
          <section aria-labelledby="experiments-heading">
            <SectionHeading id="experiments-heading" title="Recent experiments" />
            <ExperimentList experiments={experiments} limit={3} />
          </section>
        </div>
      </div>
    </div>);

}