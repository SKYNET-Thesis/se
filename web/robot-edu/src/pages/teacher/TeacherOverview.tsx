import { useQuery } from '@tanstack/react-query';
import { ClipboardCheckIcon, LibraryIcon, PlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkButton } from '../../components/ui/LinkButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { ApiError, instructorApi } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

// Same wording as My Classes; raw API text is never shown (A07).
const loadMessage = (error: unknown) => {
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (error instanceof ApiError && error.status === 401) return 'Your session has ended. Sign in again, then try again.';
  return 'Your teaching overview couldn’t be loaded. Try again.';
};

export function TeacherOverview() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const assignmentCount = (classrooms.data ?? []).reduce((sum, classroom) => sum + classroom.assignment_count, 0);
  const studentCount = (classrooms.data ?? []).reduce((sum, classroom) => sum + classroom.student_count, 0);

  return <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
    <PageHeader title="Teaching overview" description="The classrooms you teach and the work assigned to them." actions={<><LinkButton to="/teacher/classes" icon={<LibraryIcon className="h-4 w-4" />}>My classes</LinkButton><LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" />}>New assignment</LinkButton></>} />
    {classrooms.error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"><span>{loadMessage(classrooms.error)}</span>{!(classrooms.error instanceof ApiError && classrooms.error.status === 401) && <Button size="sm" variant="secondary" onClick={() => void classrooms.refetch()} loading={classrooms.isFetching}>Try again</Button>}</div>}
    {classrooms.isLoading && <p className="mt-6 text-sm text-ink-muted">Loading teaching data…</p>}
    {classrooms.data && <><section className="mt-8 grid gap-4 sm:grid-cols-3"><article className="rounded-lg bg-sunken p-5"><p className="text-sm text-ink-muted">Teaching classrooms</p><p className="mt-5 text-3xl font-semibold tabular-nums text-ink">{classrooms.data.length}</p></article><article className="rounded-lg bg-sunken p-5"><p className="text-sm text-ink-muted">Students across classes</p><p className="mt-5 text-3xl font-semibold tabular-nums text-ink">{studentCount}</p></article><article className="rounded-lg bg-sunken p-5"><p className="text-sm text-ink-muted">Classroom assignments</p><p className="mt-5 text-3xl font-semibold tabular-nums text-ink">{assignmentCount}</p></article></section>
      <section className="mt-10"><div className="flex items-end justify-between gap-4"><h2 className="text-xl font-semibold text-ink">Your classrooms</h2><Link to="/teacher/assignments" className="inline-flex min-h-[32px] items-center text-sm font-semibold text-accent underline underline-offset-4">All assignments</Link></div>
        {/* An archived classroom is marked, so it is not mistaken for one that is still being taught. */}
        {classrooms.data.length === 0 ? <div className="mt-5"><EmptyState icon={<ClipboardCheckIcon />} title="No teaching classrooms" description="Ask a school administrator to add you to a classroom." /></div> : <div className="mt-5 grid gap-4 md:grid-cols-2">{classrooms.data.map((classroom) => <article key={classroom.id} className="rounded-lg border border-line bg-surface p-5"><p className="text-xs text-ink-muted">{classroom.organization_name}</p><div className="mt-2 flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-ink">{classroom.name}</h3>{classroom.status && classroom.status !== 'active' && <ClassroomStatusBadge status={classroom.status} />}</div><p className="mt-4 text-sm text-ink-muted">{classroom.student_count} {classroom.student_count === 1 ? 'student' : 'students'} · {classroom.assignment_count} {classroom.assignment_count === 1 ? 'assignment' : 'assignments'}</p><Link to={`/teacher/classes/${classroom.id}`} className="mt-5 inline-flex min-h-[32px] items-center text-sm font-semibold text-accent underline underline-offset-4" aria-label={`Open classroom ${classroom.name}`}>Open classroom</Link></article>)}</div>}
      </section></>}
  </main>;
}
