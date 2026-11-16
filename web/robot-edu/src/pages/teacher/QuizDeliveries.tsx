import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, RotateCwIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClassroomQuizDeliveryPanel } from '../../components/assignments/ClassroomQuizDeliveryPanel';
import { ClassroomCodeTag, ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { Button } from '../../components/ui/Button';
import { inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { ApiError, instructorApi } from '../../lib/api';
import { useSchoolClassrooms, useSchoolScope } from '../../queries/schoolClassrooms';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

/** A classroom as this page shows it, from whichever authorized list the role has. */
interface RoomOption { id: string; name: string; code?: string; status?: string; course?: string | null; students?: number }

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const byStatusThenName = (a: RoomOption, b: RoomOption) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.name.localeCompare(b.name);

const listLoadMessage = (error: unknown, teacher: boolean) => {
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (error instanceof ApiError && error.status === 401) return 'Your session has ended. Sign in again, then try again.';
  if (error instanceof ApiError && error.status === 403) return teacher ? 'Your account can’t view teaching classrooms.' : 'Your account isn’t allowed to view this school’s classrooms.';
  return teacher ? 'Your classrooms couldn’t be loaded. Try again.' : 'This school’s classrooms couldn’t be loaded. Try again.';
};

/**
 * Quiz delivery (A04): schedule an already-published Question Bank quiz for one classroom and publish it to learners.
 * Quizzes are graded automatically and are authored elsewhere (Question Bank / Quiz Builder in the course catalogue);
 * Blockly programming assignments live under Assignments. One shared page serves instructors and school administrators,
 * each from the classroom list they are authorized for (teaching classrooms / the school's classrooms). Without
 * `?classroomId=` it lists those classrooms; with it, it shows that classroom's quizzes, so direct links and reloads keep
 * the classroom.
 */
export function QuizDeliveries({ audience }: { audience: 'teacher' | 'school' }) {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const [params, setParams] = useSearchParams();
  const classroomId = params.get('classroomId') ?? '';
  const teacher = audience === 'teacher';

  const teaching = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token && teacher) });
  const scope = useSchoolScope();
  const school = useSchoolClassrooms(teacher ? { ...scope, organizationId: '' } : scope); // disabled for teachers
  const list = teacher ? teaching : school;
  const noSchool = !teacher && !scope.resolving && !scope.organizationId;
  const loading = teacher ? teaching.isPending : scope.resolving || (Boolean(scope.organizationId) && school.isPending);
  const rooms: RoomOption[] = (teacher
    ? (teaching.data ?? []).map((item) => ({ id: item.id, name: item.name, code: item.code, status: item.status, students: item.enrolled_student_count ?? item.student_count }))
    : (school.data ?? []).map((item) => ({ id: item.id, name: item.name, code: item.code, status: item.status, course: item.offering_title, students: item.student_count }))
  ).sort(byStatusThenName);
  const room = rooms.find((item) => item.id === classroomId);
  const missing = Boolean(classroomId) && list.isSuccess && !room;
  const back = teacher ? '/teacher/classes' : '/school/classrooms';
  const base = teacher ? '/teacher/quizzes' : '/school/quizzes';

  return (
    <main className={teacher ? 'mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8' : 'mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 lg:px-10'}>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Quizzes</h1>
      <p className="mt-1.5 max-w-[68ch] text-[15px] text-ink-muted">
        Assign quizzes to a classroom and choose when students take them.
        {teacher && <> Robot programming tasks are under <Link className="font-semibold text-accent-ink underline underline-offset-4" to="/teacher/assignments">Assignments</Link>.</>}
      </p>

      {noSchool ? (
        <p className="mt-6 text-sm text-ink-muted">Your account has no active school administrator membership. Ask a system administrator to grant it.</p>
      ) : list.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          <span>{listLoadMessage(list.error, teacher)}</span>
          {!(list.error instanceof ApiError && (list.error.status === 401 || list.error.status === 403)) && <Button size="sm" variant="secondary" onClick={() => void list.refetch()} loading={list.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>}
        </div>
      ) : !classroomId ? (
        <ClassroomChoices rooms={rooms} loading={loading} teacher={teacher} base={base} back={back} />
      ) : loading ? (
        <div className="mt-6 border-b border-line pb-4" aria-busy="true" aria-label="Loading classroom"><div className="h-3 w-20 rounded bg-sunken motion-safe:animate-pulse" /><div className="mt-2 h-10 w-full max-w-sm rounded-md bg-sunken motion-safe:animate-pulse" /></div>
      ) : missing ? (
        <div className="mt-6 border-t border-line pt-5">
          <h2 className="text-base font-semibold text-ink">This classroom isn’t available</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-ink-muted">{teacher ? 'It isn’t one you teach. It may have been removed, or you may no longer be assigned to it.' : 'It wasn’t found in your school. It may have been removed.'}</p>
          <Link className="mt-3 inline-flex h-9 items-center text-sm font-semibold text-accent-ink underline underline-offset-4" to={base}>Choose another classroom</Link>
        </div>
      ) : room && (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line pb-4">
            <label className="block w-full min-w-0 max-w-sm text-[13px] font-medium text-ink-muted">Classroom
              <select className={`${inputClasses} mt-1 h-10 w-full py-0 font-medium text-ink`} value={classroomId} onChange={(event) => setParams(event.target.value ? { classroomId: event.target.value } : {}, { replace: true })}>
                {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ''}{item.status && item.status !== 'active' ? `, ${item.status}` : ''}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm text-ink-muted">
              {room.status && room.status !== 'active' && <ClassroomStatusBadge status={room.status} />}
              {room.course && <span className="min-w-0 break-words">Course: <span className="text-ink">{room.course}</span></span>}
              <Link className="inline-flex h-9 items-center font-medium text-accent-ink underline underline-offset-4" to={teacher ? `/teacher/classes/${room.id}` : `/school/classrooms/${room.id}`}>Open classroom</Link>
            </div>
          </div>
          <ClassroomQuizDeliveryPanel key={classroomId} classroomId={classroomId} token={token} classroomName={room.name} classroomStatus={room.status} onClassroomCheck={() => void list.refetch()} />
        </>
      )}
    </main>
  );
}

function ClassroomChoices({ rooms, loading, teacher, base, back }: { rooms: RoomOption[]; loading: boolean; teacher: boolean; base: string; back: string }) {
  return (
    <section aria-labelledby="quiz-classrooms-heading" className="mt-7">
      <h2 id="quiz-classrooms-heading" className="text-base font-semibold text-ink">Classrooms</h2>
      {rooms.some((item) => item.status && item.status !== 'active') && <p className="mt-1 text-sm text-ink-muted">Archived classrooms are view-only.</p>}
      {loading ? (
        <ul aria-label="Loading classrooms" className="mt-4 divide-y divide-line border-y border-line">{[0, 1, 2].map((item) => <li key={item} className="flex items-center gap-4 py-4"><div className="h-4 w-40 rounded bg-sunken motion-safe:animate-pulse" /><div className="h-3 w-24 rounded bg-sunken motion-safe:animate-pulse" /></li>)}</ul>
      ) : rooms.length === 0 ? (
        <p className="mt-4 border-y border-line py-4 text-sm text-ink-muted">
          {teacher ? 'You aren’t assigned to teach a classroom yet. A school administrator can add you to one.' : <>Your school has no classrooms yet. <Link className="font-semibold text-accent-ink underline underline-offset-4" to={back}>Create one in Classrooms</Link>, then assign it quizzes here.</>}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rooms.map((item) => (
            <li key={item.id}>
              <Link to={`${base}?classroomId=${item.id}`} className="group -mx-2 flex min-h-[56px] items-center gap-4 rounded-md px-2 py-3 hover:bg-sunken">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="break-words font-semibold text-ink group-hover:text-accent-ink">{item.name}</span>
                    {item.code && <ClassroomCodeTag code={item.code} />}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-4 text-[13px] text-ink-muted">
                    {item.course !== undefined && <span className="break-words">{item.course ?? 'No course yet'}</span>}
                    {typeof item.students === 'number' && <span className="tabular-nums">{plural(item.students, 'student')}</span>}
                  </span>
                </span>
                {item.status && item.status !== 'active' && <ClassroomStatusBadge status={item.status} />}
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-subtle group-hover:text-accent-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
