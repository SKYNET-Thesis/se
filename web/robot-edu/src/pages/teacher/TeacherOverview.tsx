import { useQuery } from '@tanstack/react-query';
import { ClipboardCheckIcon, LibraryIcon, PlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkButton } from '../../components/ui/LinkButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { instructorApi } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

export function TeacherOverview() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const assignmentCount = (classrooms.data ?? []).reduce((sum, classroom) => sum + classroom.assignment_count, 0);
  const studentCount = (classrooms.data ?? []).reduce((sum, classroom) => sum + classroom.student_count, 0);

  return <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
    <PageHeader title="Teaching overview" description="Your authorized classrooms and assignment delivery from the Education API." actions={<><LinkButton to="/teacher/classes" icon={<LibraryIcon className="h-4 w-4" />}>My classes</LinkButton><LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" />}>New assignment</LinkButton></>} />
    {classrooms.error && <p role="alert" className="mt-6 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{classrooms.error instanceof Error ? classrooms.error.message : 'Teaching data could not be loaded.'}</p>}
    {classrooms.isLoading && <p className="mt-6 text-sm text-ink-muted">Loading teaching data…</p>}
    {classrooms.data && <><section className="mt-8 grid gap-4 sm:grid-cols-3"><article className="bg-[#edf1ed] p-5"><p className="text-sm text-ink-muted">Teaching classrooms</p><p className="mt-5 text-3xl font-semibold text-ink">{classrooms.data.length}</p></article><article className="bg-[#edf1ed] p-5"><p className="text-sm text-ink-muted">Students across classes</p><p className="mt-5 text-3xl font-semibold text-ink">{studentCount}</p></article><article className="bg-[#edf1ed] p-5"><p className="text-sm text-ink-muted">Classroom assignments</p><p className="mt-5 text-3xl font-semibold text-ink">{assignmentCount}</p></article></section>
      <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#176255]">Current delivery</p><h2 className="mt-2 text-xl font-semibold text-ink">Your classrooms</h2></div><Link to="/teacher/assignments" className="text-sm font-semibold text-[#176255] underline underline-offset-4">All assignments</Link></div>
        {classrooms.data.length === 0 ? <div className="mt-5"><EmptyState icon={<ClipboardCheckIcon />} title="No teaching classrooms" description="Ask a school administrator to add you to a classroom." /></div> : <div className="mt-5 grid gap-4 md:grid-cols-2">{classrooms.data.map((classroom) => <article key={classroom.id} className="border border-line p-5"><p className="text-xs text-ink-muted">{classroom.organization_name}</p><h3 className="mt-2 text-lg font-semibold text-ink">{classroom.name}</h3><p className="mt-4 text-sm text-ink-muted">{classroom.student_count} students · {classroom.assignment_count} assignments</p><Link to={`/teacher/classes/${classroom.id}`} className="mt-5 inline-block text-sm font-semibold text-[#176255] underline underline-offset-4">Open classroom</Link></article>)}</div>}
      </section></>}
  </main>;
}
