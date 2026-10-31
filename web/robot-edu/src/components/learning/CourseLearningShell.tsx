import React, { useState } from 'react';
import { BookOpenIcon, CheckCircle2Icon, ChevronRightIcon, MenuIcon, LockIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { progressionApi, type CoursePathLesson, type LessonDetailResponse } from '../../lib/api';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';

export function CourseLearningShell({ courseId, lessonId, lesson, pathOverride, children }: { courseId: string; lessonId: string; lesson: LessonDetailResponse; pathOverride?: { lessons: CoursePathLesson[] }; children: React.ReactNode }) {
  const { session } = useSupabaseSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathQuery = useQuery({ queryKey: ['course-learning-shell', courseId, session?.user.id], queryFn: () => progressionApi.coursePath(courseId, session?.access_token ?? ''), enabled: Boolean(session?.access_token && courseId), staleTime: 30_000 });
  const lessons = pathOverride?.lessons ?? pathQuery.data?.lessons ?? [];

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-4 py-5 md:px-8 md:py-8 lg:flex-row lg:gap-10">
    <button type="button" className="inline-flex items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden" aria-expanded={mobileOpen} aria-controls="course-material-nav" onClick={() => setMobileOpen((open) => !open)}><MenuIcon className="h-4 w-4" /> Course Material</button>
    <aside id="course-material-nav" aria-label="Course Material" className={`${mobileOpen ? 'block' : 'hidden'} w-full shrink-0 lg:block lg:w-72`}>
      <div className="sticky top-5 rounded-xl border border-line bg-surface p-5 shadow-hairline">
        <Link to={`/courses/${courseId}`} className="flex items-start gap-2 rounded-lg p-2 text-sm font-semibold text-ink hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><BookOpenIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" /><span>Robotics Fundamentals</span></Link>
        <p className="px-2 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">Course Material</p>
        <nav aria-label="Course lessons" className="space-y-1">{lessons.map((item) => <LessonNavItem key={item.id} courseId={courseId} lesson={item} active={item.id === lessonId} />)}</nav><Link to={`/courses/${courseId}/info`} className="mt-3 flex items-center gap-2 border-t border-line px-2 pt-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><BookOpenIcon className="h-4 w-4" /> Course Info</Link>
      </div>
    </aside>
    <div className="min-w-0 flex-1">{children}</div>
  </div>;
}
function LessonNavItem({ courseId, lesson, active }: { courseId: string; lesson: CoursePathLesson; active: boolean }) {
  const locked = lesson.status === 'locked';
  const content = <><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sunken font-mono text-[10px] font-semibold text-ink-muted">{lesson.code ?? `L${lesson.ordinal}`}</span><span className="min-w-0 flex-1 truncate">{lesson.title}</span>{lesson.status === 'completed' ? <CheckCircle2Icon className="h-4 w-4 shrink-0 text-ok" /> : locked ? <LockIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" /> : <ChevronRightIcon className="h-4 w-4 shrink-0 text-accent-ink" />}</>;
  return locked ? <div aria-current={active ? 'page' : undefined} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-muted" title={lesson.lockReason?.message}>{content}</div> : <Link aria-current={active ? 'page' : undefined} to={`/courses/${courseId}/lessons/${lesson.id}`} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink hover:bg-sunken'}`}>{content}</Link>;
}
