import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenIcon, RotateCwIcon } from 'lucide-react';
import { catalogApi, progressionApi } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { useRole } from '../contexts/RoleContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { learningErrorMessage } from '../queries/studentLearningModel';
import { LearningBreadcrumb } from '../components/learning/LearningBreadcrumb';
import { Button } from '../components/ui/Button';

interface InfoLesson { id: string; title: string; ordinal?: number }

/**
 * Course details. Students reach it from their course path (enrollment-scoped data); teachers and school administrators
 * reach it from the course catalogue, so it also works without an enrollment by using the catalogue endpoints. Only
 * fields the API returns are shown: no default level, module count or generic description.
 */
export function CourseInfo() {
  const { courseId = '' } = useParams();
  const { session, sessionRevision } = useSupabaseSession();
  const { role } = useRole();
  const token = session?.access_token ?? '';
  const student = role === 'student';
  const path = useQuery({ queryKey: studentLearningKeys.coursePath(courseId, session?.user.id, sessionRevision), queryFn: () => progressionApi.coursePath(courseId, token), enabled: Boolean(token && courseId && student) });
  const courseQuery = useQuery({ queryKey: ['catalog', 'course', courseId], queryFn: () => catalogApi.course(courseId, token), enabled: Boolean(token && courseId && role) });
  const lessonsQuery = useQuery({ queryKey: ['catalog', 'lessons', courseId], queryFn: () => catalogApi.lessons(courseId, token), enabled: Boolean(token && courseId && role && !student) });
  const course = path.data?.course ?? courseQuery.data;
  const lessons: InfoLesson[] = path.data?.lessons
    ?? (lessonsQuery.data ?? []).map((lesson) => ({ id: String(lesson.id), title: String(lesson.title ?? ''), ordinal: typeof lesson.ordinal === 'number' ? lesson.ordinal : undefined }));
  const failed = !course && courseQuery.isError ? courseQuery.error : null;
  const parent = student ? { label: 'My learning', to: '/my-learning' } : { label: 'Course catalogue', to: '/courses' };

  if (failed) {
    return <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <LearningBreadcrumb items={[parent, { label: 'Course details' }]} />
      <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
        <span>{learningErrorMessage(failed, 'courses')}</span>
        <Button size="sm" variant="secondary" onClick={() => void courseQuery.refetch()} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
      </div>
    </main>;
  }
  if (!course) return <main aria-busy="true" className="mx-auto max-w-4xl px-4 py-12 text-sm text-ink-muted md:px-8">Loading course details…</main>;

  const facts = [
    course.level ? ['Level', course.level] : null,
    course.recommendedGrades ? ['Recommended for', course.recommendedGrades] : null,
    lessons.length ? ['Lessons', String(lessons.length)] : null,
  ].filter(Boolean) as Array<[string, string]>;

  return <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
    <LearningBreadcrumb items={student ? [parent, { label: course.title, to: `/courses/${courseId}` }, { label: 'Course details' }] : [parent, { label: course.title }]} />
    <header className="mt-6 border-b border-line pb-7">
      <p className="text-sm font-medium text-ink-muted">Course details</p>
      <h1 className="mt-1 text-balance text-3xl font-semibold tracking-[-0.02em] text-ink md:text-4xl">{course.title}</h1>
      {course.description && <p className="mt-3 max-w-[68ch] text-pretty text-[17px] leading-[1.6] text-ink-muted">{course.description}</p>}
    </header>
    <div className="grid gap-10 py-8 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {course.learningOutcome && <section aria-labelledby="outcome-heading" className="mb-8">
          <h2 id="outcome-heading" className="text-xl font-semibold text-ink">What students will learn</h2>
          <p className="mt-2 max-w-[68ch] leading-7 text-ink">{course.learningOutcome}</p>
        </section>}
        <section aria-labelledby="structure-heading">
          <h2 id="structure-heading" className="text-xl font-semibold text-ink">Lessons</h2>
          {lessons.length === 0
            ? <p className="mt-2 text-sm text-ink-muted">{lessonsQuery.isError || path.isError ? 'The lesson list couldn’t be loaded.' : 'No lessons have been published yet.'}</p>
            : <ol className="mt-3 divide-y divide-line border-y border-line">{lessons.map((lesson, position) => <li key={lesson.id}>
              {student
                ? <Link to={`/courses/${courseId}/lessons/${lesson.id}`} className="flex min-h-[48px] items-center gap-3 rounded-md px-2 py-3 text-ink transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-muted">{lesson.ordinal ?? position + 1}.</span><span className="font-medium">{lesson.title}</span></Link>
                // Lesson pages need an enrollment, so staff see the structure without dead links.
                : <p className="flex min-h-[48px] items-center gap-3 px-2 py-3 text-ink"><span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-muted">{lesson.ordinal ?? position + 1}.</span><span className="font-medium">{lesson.title}</span></p>}
            </li>)}</ol>}
        </section>
      </div>
      {facts.length > 0 && <aside aria-label="Course facts">
        <dl className="divide-y divide-line border-y border-line text-sm">{facts.map(([term, value]) => <div key={term} className="flex justify-between gap-4 py-3"><dt className="text-ink-muted">{term}</dt><dd className="text-right font-medium text-ink">{value}</dd></div>)}</dl>
        {course.competencies && course.competencies.length > 0 && <div className="mt-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><BookOpenIcon className="h-4 w-4 text-accent" aria-hidden />Competencies</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">{course.competencies.map((item) => <li key={item.code}>{item.title}</li>)}</ul>
        </div>}
      </aside>}
    </div>
  </main>;
}
