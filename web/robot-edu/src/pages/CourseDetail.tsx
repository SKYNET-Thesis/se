import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightIcon, ChevronLeftIcon, FileQuestionIcon } from 'lucide-react';
import { catalogApi, type ApiCourse, type ApiRecord } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';
import { Button } from '../components/ui/Button';

interface LessonSummary { id: string; title: string; ordinal: number; summary: string; }

function lessonSummary(value: ApiRecord): LessonSummary | null {
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  const content = value.content && typeof value.content === 'object' ? value.content as Record<string, unknown> : {};
  return { id: value.id, title: value.title, ordinal: typeof value.ordinal === 'number' ? value.ordinal : 0, summary: typeof content.summary === 'string' ? content.summary : '' };
}

export function CourseDetail() {
  const { courseId = '' } = useParams();
  const { session } = useSupabaseSession();
  const [course, setCourse] = useState<ApiCourse | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session || !courseId) return;
    let active = true;
    setLoading(true); setError(null);
    void Promise.all([catalogApi.course(courseId, session.access_token), catalogApi.lessons(courseId, session.access_token)])
      .then(([nextCourse, nextLessons]) => { if (!active) return; setCourse(nextCourse); setLessons(nextLessons.map(lessonSummary).filter((lesson): lesson is LessonSummary => Boolean(lesson)).sort((a, b) => a.ordinal - b.ordinal)); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load this course.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, session]);

  useEffect(() => load(), [load]);

  if (loading) return <div className="mx-auto w-full max-w-[1120px] px-4 py-10 text-sm text-ink-muted md:px-8">Loading course…</div>;
  if (error || !course) return <EmptyState icon={<FileQuestionIcon />} title="Course unavailable" description={error ?? 'This course may no longer be available to your account.'} action={<div className="flex gap-2"><Button variant="secondary" onClick={load}>Try again</Button><LinkButton to="/courses">All courses</LinkButton></div>} />;

  return <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-9">
    <Link to="/courses" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><ChevronLeftIcon className="h-4 w-4" /> Courses</Link>
    <header className="mt-5 max-w-3xl border-b border-line pb-8">
      <p className="text-xs font-medium uppercase tracking-wide text-accent-ink">{course.status}</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-ink">{course.title}</h1>
      {course.description && <p className="mt-3 text-[16px] leading-relaxed text-ink-muted">{course.description}</p>}
      {lessons[0] && <LinkButton to={`/courses/${course.id}/lessons/${lessons[0].id}`} variant="primary" className="mt-6" icon={<ArrowRightIcon className="h-4 w-4" />}>Start course</LinkButton>}
    </header>
    <section className="mt-8 max-w-3xl" aria-labelledby="lessons-heading">
      <h2 id="lessons-heading" className="text-lg font-semibold text-ink">Lessons</h2>
      {lessons.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No lessons have been published yet.</p> : <ol className="mt-3 divide-y divide-line border-y border-line">{lessons.map((lesson, index) => <li key={lesson.id}><Link to={`/courses/${course.id}/lessons/${lesson.id}`} className="flex gap-4 px-2 py-4 hover:bg-sunken"><span className="w-6 pt-0.5 text-sm font-medium text-ink-subtle">{String(index + 1).padStart(2, '0')}</span><span><span className="block font-medium text-ink">{lesson.title}</span>{lesson.summary && <span className="mt-1 block text-sm text-ink-muted">{lesson.summary}</span>}</span></Link></li>)}</ol>}
    </section>
  </div>;
}
