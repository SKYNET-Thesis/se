import { useQuery } from '@tanstack/react-query';
import { ClipboardCheckIcon, FileQuestionIcon, UsersIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClassroomQuizDeliveryPanel } from '../../components/assignments/ClassroomQuizDeliveryPanel';
import { EmptyState } from '../../components/ui/EmptyState';
import { inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { classroomApi, instructorApi } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

/**
 * Quiz delivery: schedule an already-published Question Bank quiz for one classroom and publish it to learners.
 * Quizzes are graded automatically and are authored elsewhere (Question Bank / Quiz Builder in the course catalogue);
 * Blockly programming assignments live under Assignments. One shared page serves instructors and school administrators.
 */
export function QuizDeliveries({ audience }: { audience: 'teacher' | 'school' }) {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const [params, setParams] = useSearchParams();
  const classroomId = params.get('classroomId') ?? '';
  const teacher = audience === 'teacher';

  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token && teacher) });
  const detail = useQuery({ queryKey: teacherLearningKeys.classroom(classroomId), queryFn: () => classroomApi.detail(classroomId, token), enabled: Boolean(token && classroomId && !teacher) });
  const name = teacher ? classrooms.data?.find((room) => room.id === classroomId)?.name : detail.data?.name;
  const error = (teacher ? classrooms.error : detail.error) as Error | null;
  const back = teacher ? '/teacher/classes' : '/school/classrooms';

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Quizzes</h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">Deliver published Question Bank quizzes to a classroom. Quizzes are graded automatically and keep their own attempts.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <p className="flex gap-2 rounded-md border border-line bg-sunken/50 p-3 text-[13px] text-ink-muted"><FileQuestionIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong className="text-ink">Quiz content</strong> (Question Bank, Quiz Builder, publishing) is authored in the course catalogue. This page only schedules and delivers published quizzes.</span></p>
        {teacher && <p className="flex gap-2 rounded-md border border-line bg-sunken/50 p-3 text-[13px] text-ink-muted"><ClipboardCheckIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong className="text-ink">Robot programming tasks</strong> with rubric review are managed under <Link className="font-semibold text-accent-ink underline underline-offset-4" to="/teacher/assignments">Assignments</Link>.</span></p>}
      </div>

      {teacher && (
        <label className="mt-6 block text-[13px] font-medium text-ink">Classroom
          <select className={`${inputClasses} mt-1 h-9 max-w-sm py-0`} value={classroomId} onChange={(event) => setParams(event.target.value ? { classroomId: event.target.value } : {}, { replace: true })}>
            <option value="">Select a classroom</option>{(classrooms.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
      )}
      {error && <p role="alert" className="mt-5 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{error.message || 'The classroom could not be loaded.'}</p>}
      {teacher && classrooms.isSuccess && !classrooms.data.length && <EmptyState className="mt-6 rounded-lg border border-line bg-surface" icon={<UsersIcon />} title="No classrooms to deliver to" description="You are not assigned to teach any classroom yet." />}
      {!classroomId && !error && (!teacher || (classrooms.data?.length ?? 0) > 0) && <EmptyState className="mt-6 rounded-lg border border-line bg-surface" icon={<FileQuestionIcon />} title="Choose a classroom" description={teacher ? 'Select a classroom to schedule and publish its quizzes.' : 'Open a classroom and choose “Manage quiz deliveries” to schedule its quizzes.'} action={teacher ? undefined : <Link className="font-semibold text-accent-ink underline underline-offset-4" to={back}>Go to classrooms</Link>} />}
      {classroomId && !error && (
        <>
          {name && <p className="mt-5 text-sm text-ink-muted">Classroom: <strong className="text-ink">{name}</strong> · <Link className="text-accent-ink underline underline-offset-4" to={teacher ? `/teacher/classes/${classroomId}` : back}>{teacher ? 'Classroom page' : 'Back to classrooms'}</Link></p>}
          <ClassroomQuizDeliveryPanel key={classroomId} classroomId={classroomId} token={token} />
        </>
      )}
    </main>
  );
}
