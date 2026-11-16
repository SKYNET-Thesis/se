import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, RotateCwIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClassroomCodeTag, ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { ApiError, instructorApi, type ApiTeachingClassroom } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

const countLabel = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const activeFirst = (a: ApiTeachingClassroom, b: ApiTeachingClassroom) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.name.localeCompare(b.name);
const loadMessage = (error: unknown) => {
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (error instanceof ApiError && error.status === 401) return 'Your session has ended. Sign in again, then try again.';
  return 'Your classes couldn’t be loaded. Try again.';
};

/** The classrooms a teacher teaches (GET /me/teaching-classrooms), sharing its cache with Quizzes and the classroom page. */
export function TeacherClasses() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const classes = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const rows = [...(classes.data ?? [])].sort(activeFirst);
  const schools = new Set(rows.map((item) => item.organization_name).filter(Boolean));

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="My classes" />
      {classes.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          <span>{loadMessage(classes.error)}</span>
          {!(classes.error instanceof ApiError && classes.error.status === 401) && <Button size="sm" variant="secondary" onClick={() => void classes.refetch()} loading={classes.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
        </div>
      ) : classes.isPending ? (
        <ul aria-label="Loading classes" className="mt-4 divide-y divide-line">{[0, 1, 2].map((item) => <li key={item} className="flex items-center gap-4 py-4"><div className="h-4 w-44 rounded bg-sunken motion-safe:animate-pulse" /><div className="h-3 w-28 rounded bg-sunken motion-safe:animate-pulse" /></li>)}</ul>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">You aren’t teaching any classes yet. A school administrator can add you to a classroom.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((item) => (
            <li key={item.id}>
              <Link to={`/teacher/classes/${item.id}`} className="group -mx-2 flex min-h-[64px] items-center gap-4 rounded-md px-2 py-3.5 hover:bg-sunken">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="break-words text-[15px] font-semibold text-ink group-hover:text-accent">{item.name}</span>
                    {item.code && <ClassroomCodeTag code={item.code} />}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] tabular-nums text-ink-muted">
                    <span>{countLabel(item.student_count, 'student')}</span>
                    <span>{countLabel(item.assignment_count, 'assigned item')}</span>
                    {schools.size > 1 && item.organization_name && <span className="break-words">{item.organization_name}</span>}
                  </span>
                </span>
                {item.status && item.status !== 'active' && <ClassroomStatusBadge status={item.status} />}
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-subtle group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
