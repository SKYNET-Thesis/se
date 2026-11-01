import React, { useState } from 'react';
import { BookOpenIcon, CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, MenuIcon, LockIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { progressionApi, type CoursePathLesson, type LessonDetailResponse } from '../../lib/api';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { buildLessonActivities } from './lessonActivities';

export function CourseLearningShell({ courseId, lessonId, lesson, pathOverride, focused = false, activityId, children }: { courseId: string; lessonId: string; lesson: LessonDetailResponse; pathOverride?: { lessons: CoursePathLesson[] }; focused?: boolean; activityId?: string; children: React.ReactNode }) {
  const { session } = useSupabaseSession();
  const location = useLocation();
  const focusedRoute = focused || /\/activities\//.test(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusedNavigatorCollapsed, setFocusedNavigatorCollapsed] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => ({ [lessonId]: true }));
  const pathQuery = useQuery({ queryKey: ['course-learning-shell', courseId, session?.user.id], queryFn: () => progressionApi.coursePath(courseId, session?.access_token ?? ''), enabled: Boolean(session?.access_token && courseId), staleTime: 30_000 });
  const lessons = pathOverride?.lessons ?? pathQuery.data?.lessons ?? [];

  const activities = focusedRoute ? buildLessonActivities(lesson) : [];
  const toggleModule = (id: string) => setExpandedModules((current) => ({ ...current, [id]: !current[id] }));
  const expandAll = () => setExpandedModules(Object.fromEntries(lessons.map((item) => [item.id, true])));
  const collapseAll = () => setExpandedModules(Object.fromEntries(lessons.map((item) => [item.id, false])));
  return <div className={`mx-auto flex w-full flex-col gap-5 px-4 py-5 md:px-8 md:py-8 lg:flex-row ${focusedRoute ? 'max-w-none min-h-screen lg:gap-3' : 'max-w-[1520px] lg:gap-10'}`}>
    <button type="button" className="inline-flex items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden" aria-expanded={mobileOpen} aria-controls="course-material-nav" onClick={() => setMobileOpen((open) => !open)}><MenuIcon className="h-4 w-4" /> Course Material</button>
    {focusedRoute && <button type="button" className="hidden h-10 w-10 shrink-0 items-center justify-center self-start rounded-lg border border-line bg-surface text-ink transition-colors duration-200 ease-out hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none lg:inline-flex" aria-label={focusedNavigatorCollapsed ? 'Show course material' : 'Hide course material'} aria-expanded={!focusedNavigatorCollapsed} aria-controls="course-material-nav" onClick={() => setFocusedNavigatorCollapsed((collapsed) => !collapsed)}><MenuIcon className="h-4 w-4" /></button>}
    <aside id="course-material-nav" aria-label="Course Material" className={`${mobileOpen ? 'block' : 'hidden'} w-full shrink-0 transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none lg:block ${focusedRoute ? (focusedNavigatorCollapsed ? 'lg:w-0 lg:overflow-hidden lg:opacity-0' : 'lg:w-80 lg:opacity-100') : 'lg:w-72'}`}>
      <div className={`rounded-xl border border-line bg-surface p-5 shadow-hairline ${focusedRoute ? 'lg:sticky lg:top-0 lg:h-[100dvh] lg:overflow-y-auto' : 'sticky top-5'}`}>
        <Link to={`/courses/${courseId}`} className="flex items-start gap-2 rounded-lg p-2 text-sm font-semibold text-ink hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><BookOpenIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" /><span>{lesson.course_title}</span></Link>
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">Course Material</p>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-ink">
            <button type="button" onClick={expandAll} className="rounded px-1.5 py-1 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Expand all modules">Expand all</button>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={collapseAll} className="rounded px-1.5 py-1 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Collapse all modules">Collapse all</button>
          </div>
        </div>
        <nav aria-label="Course lessons" className="space-y-1">{lessons.map((item) => <LessonModuleNavItem key={item.id} courseId={courseId} lesson={item} active={item.id === lessonId} expanded={Boolean(expandedModules[item.id])} onToggle={() => toggleModule(item.id)} activities={item.id === lessonId ? activities : []} activityId={item.id === lessonId ? activityId : undefined} pathname={location.pathname} />)}</nav>
        <Link to={`/courses/${courseId}/info`} className="mt-3 flex items-center gap-2 border-t border-line px-2 pt-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><BookOpenIcon className="h-4 w-4" /> Course Info</Link>
      </div>
    </aside>
    <div className="min-w-0 flex-1">{children}</div>
  </div>;
}
function LessonModuleNavItem({ courseId, lesson, active, expanded, onToggle, activities, activityId, pathname }: { courseId: string; lesson: CoursePathLesson; active: boolean; expanded: boolean; onToggle: () => void; activities: ReturnType<typeof buildLessonActivities>; activityId?: string; pathname: string }) {
  const locked = lesson.status === 'locked';
  const code = lesson.code ?? `L${lesson.ordinal}`;
  const content = <><span className="grid h-7 min-w-[44px] shrink-0 place-items-center whitespace-nowrap rounded-md bg-sunken font-mono text-[10px] font-semibold text-ink-muted">{code}</span><span className="min-w-0 flex-1 truncate">{lesson.title}</span>{lesson.status === 'completed' ? <CheckCircle2Icon aria-label="Completed" className="h-4 w-4 shrink-0 text-ok" /> : locked ? <LockIcon aria-label="Locked" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" /> : <ChevronRightIcon className="h-4 w-4 shrink-0 text-accent-ink" />}</>;
  const panelId = `course-module-${lesson.id}`;
  return <section className={`overflow-hidden rounded-lg ${active ? 'bg-accent-soft/50' : ''}`}>
    <div className="flex items-center gap-1 px-1 py-1">
      {locked ? <div aria-current={active ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-sm text-ink-muted" title={lesson.lockReason?.message}>{content}</div> : <Link aria-current={active ? 'page' : undefined} to={`/courses/${courseId}/lessons/${lesson.id}`} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'font-semibold text-accent-ink' : 'text-ink hover:bg-sunken'}`}>{content}</Link>}
      <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${code}`} aria-expanded={expanded} aria-controls={panelId} onClick={onToggle} className="grid h-8 w-8 shrink-0 place-items-center rounded text-ink-muted transition-transform duration-200 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"><ChevronDownIcon className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} /></button>
    </div>
    <div id={panelId} className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="min-h-0 overflow-hidden">
        <div className="space-y-1 border-l border-line pb-2 pl-4 pr-2 pt-1 text-xs">
          {locked && lesson.lockReason && <p className="py-1 text-ink-muted"><LockIcon className="mr-1 inline h-3.5 w-3.5" />{lesson.lockReason.message}</p>}
          {active && activities.length > 0 ? activities.map((activity) => activity.status === 'unavailable' ? <div key={activity.id} className="flex items-center gap-2 rounded px-2 py-2 text-ink-muted"><LockIcon className="h-3.5 w-3.5 shrink-0" /><span>{activity.title}</span></div> : <Link key={activity.id} aria-current={activity.id === activityId || pathname.endsWith(`/${activity.id}`) ? 'page' : undefined} to={`/courses/${courseId}/lessons/${lesson.id}/activities/${activity.id}`} className={`block rounded px-2 py-2 transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activity.id === activityId || pathname.endsWith(`/${activity.id}`) ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink'}`}><span className="block">{activity.title}</span><span className="text-ink-muted">{activity.type.replace('_', ' ')}</span></Link>) : (lesson.learningItems ?? []).map((item) => <p key={item} className="rounded px-2 py-1.5 text-ink-muted">{item}</p>)}
          {lesson.estimatedMinutes && <p className="px-2 pt-1 text-ink-subtle">Estimated {lesson.estimatedMinutes} min</p>}
        </div>
      </div>
    </div>
  </section>;
}
