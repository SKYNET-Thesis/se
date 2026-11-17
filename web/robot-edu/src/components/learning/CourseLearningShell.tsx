import React, { useState, useEffect, useRef } from 'react';
import { BookOpenIcon, CheckIcon, ChevronDownIcon, MenuIcon, LockIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, XIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { progressionApi, type CoursePathLesson, type LessonDetailResponse } from '../../lib/api';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import {
  buildLessonActivitySections,
  type LessonActivitySection,
} from './lessonActivities';
import { sessionExpandedState } from './CourseLearningState';
import { ActivityCard } from './ActivityCard';
import { activityCompletionState } from './activityCompletionState';
import { useActivityProgress } from './useActivityProgress';

/** Whether the desktop lesson list is hidden, remembered for this browser session (storage may be unavailable). */
function readCollapsed(mode: 'content' | 'quiz'): boolean {
  try { const stored = window.sessionStorage.getItem(`vista.lessonList.hidden.${mode}`); if (stored !== null) return stored === '1'; } catch { /* private mode */ }
  return mode === 'quiz';
}
function writeCollapsed(mode: 'content' | 'quiz', hidden: boolean) {
  try { window.sessionStorage.setItem(`vista.lessonList.hidden.${mode}`, hidden ? '1' : '0'); } catch { /* private mode */ }
}

export function CourseLearningShell({
  courseId,
  lessonId,
  lesson,
  pathOverride,
  focused = false,
  activityId,
  mode = 'content',
  children,
}: {
  courseId: string;
  lessonId: string;
  lesson: LessonDetailResponse;
  pathOverride?: { lessons: CoursePathLesson[] };
  focused?: boolean;
  activityId?: string;
  /** 'quiz' starts with the lesson list hidden on desktop so the question has the room; either choice is remembered. */
  mode?: 'content' | 'quiz';
  children: React.ReactNode;
}) {
  const { session } = useSupabaseSession();
  const location = useLocation();
  const focusedRoute = focused || /\/activities\//.test(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusedNavigatorCollapsed, setFocusedNavigatorCollapsedState] = useState(() => readCollapsed(mode));
  useEffect(() => setFocusedNavigatorCollapsedState(readCollapsed(mode)), [mode]);
  const setFocusedNavigatorCollapsed = (update: (collapsed: boolean) => boolean) => setFocusedNavigatorCollapsedState((current) => {
    const next = update(current);
    writeCollapsed(mode, next);
    return next;
  });
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    const cached = sessionExpandedState[courseId] ?? {};
    return {
      ...cached,
      [lessonId]: cached[lessonId] !== undefined ? cached[lessonId] : true,
    };
  });

  useEffect(() => {
    setExpandedModules((prev) => {
      if (prev[lessonId]) return prev;
      const next = { ...prev, [lessonId]: true };
      sessionExpandedState[courseId] = next;
      return next;
    });
  }, [courseId, lessonId]);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (mobileOpen) {
      wasOpen.current = true;
      closeRef.current?.focus();
      const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    if (wasOpen.current) { wasOpen.current = false; triggerRef.current?.focus(); }
    return undefined;
  }, [mobileOpen]);

  const pathQuery = useQuery({
    queryKey: ['course-learning-shell', courseId, session?.user.id],
    queryFn: () => progressionApi.coursePath(courseId, session?.access_token ?? ''),
    enabled: Boolean(session?.access_token && courseId),
    staleTime: 30_000,
  });
  const activityProgressQuery = useActivityProgress(courseId);
  const completedActivityIds = activityProgressQuery.data?.activities
    .filter((item) => item.status === 'completed')
    .map((item) => item.activityId);

  const currentLessonFallback = {
    id: lesson.id,
    title: lesson.title,
    ordinal: lesson.ordinal,
    code: null,
    status: lesson.status,
    progressPercent: lesson.progressPercent,
    lockReason: lesson.lockReason,
    prerequisite: lesson.prerequisites,
    completedAt: null,
    summary: lesson.content?.summary ?? null,
    learningItems: [],
    estimatedMinutes: lesson.content?.estimatedMinutes ?? null,
  } as CoursePathLesson;

  const lessons = pathOverride?.lessons ?? pathQuery.data?.lessons ?? [currentLessonFallback];
  const sections = buildLessonActivitySections(lesson);
  const completedLessonCount = lessons.filter((item) => item.status === 'completed').length;

  const toggleModule = (id: string) =>
    setExpandedModules((current) => {
      const next = { ...current, [id]: !current[id] };
      sessionExpandedState[courseId] = next;
      return next;
    });

  const expandAll = () => {
    const next = Object.fromEntries(lessons.map((item) => [item.id, true]));
    sessionExpandedState[courseId] = next;
    setExpandedModules(next);
  };

  const collapseAll = () => {
    const next = Object.fromEntries(lessons.map((item) => [item.id, false]));
    sessionExpandedState[courseId] = next;
    setExpandedModules(next);
  };

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-5 px-4 py-5 md:px-8 md:py-8 lg:flex-row ${
        focusedRoute ? 'max-w-none min-h-screen lg:gap-3' : 'max-w-[1520px] lg:gap-10'
      }`}
    >
      <button
        type="button"
        ref={triggerRef}
        className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-hairline transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="course-material-nav"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <MenuIcon className="h-4 w-4" aria-hidden /> Lessons
      </button>

      {focusedRoute && (
        <button
          type="button"
          className="hidden min-h-[40px] shrink-0 items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none lg:inline-flex"
          aria-expanded={!focusedNavigatorCollapsed}
          aria-controls="course-material-nav"
          onClick={() => setFocusedNavigatorCollapsed((collapsed) => !collapsed)}
        >
          {focusedNavigatorCollapsed ? <PanelLeftOpenIcon className="h-4 w-4" aria-hidden /> : <PanelLeftCloseIcon className="h-4 w-4" aria-hidden />}
          {focusedNavigatorCollapsed ? 'Show lessons' : 'Hide lessons'}
        </button>
      )}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close course material"
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="course-material-nav"
        aria-label="Course Material"
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        // No `lg:w-auto` here: it outranked lg:w-72 / lg:w-0 in the generated CSS, so the list grew to ~500px and "hiding"
        // it only made it transparent while it kept its space. Hidden now means `lg:hidden` (out of layout and tab order).
        className={`${mobileOpen ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-[min(90vw,22rem)] shrink-0 overflow-y-auto bg-surface motion-reduce:transition-none lg:static lg:z-auto lg:overflow-visible ${
          focusedRoute && focusedNavigatorCollapsed ? 'lg:hidden' : 'lg:block lg:w-80'
        }`}
      >
        <div
          className={`min-h-full rounded-xl border border-line bg-surface p-5 shadow-hairline lg:min-h-0 ${
            focusedRoute ? 'lg:sticky lg:top-0 lg:h-[100dvh] lg:overflow-y-auto' : 'sticky top-5'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
          <Link
            to={`/courses/${courseId}`}
            className="flex min-w-0 items-start gap-2.5 rounded-lg p-2 text-base font-bold leading-snug text-ink transition-colors duration-150 ease-out hover:bg-sunken hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <BookOpenIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
            <span>{lesson.course_title}</span>
          </Link>
          <button ref={closeRef} type="button" aria-label="Close course material" onClick={() => setMobileOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"><XIcon className="h-5 w-5" aria-hidden /></button>
          </div>
          {pathOverride?.lessons || pathQuery.data?.lessons ? (
            <p className="px-2 pt-1 text-xs text-ink-muted">{completedLessonCount} of {lessons.length} lessons completed</p>
          ) : null}
          {!activityProgressQuery.canVerify && (
            <p role="status" className="px-2 pt-2 text-xs text-ink-muted">Sign in to verify activity progress.</p>
          )}
          {activityProgressQuery.canVerify && !activityProgressQuery.data && activityProgressQuery.isPending && (
            <p role="status" className="px-2 pt-2 text-xs text-ink-muted">Checking activity progress…</p>
          )}
          {activityProgressQuery.isError && (
            <div className="px-2 pt-2 text-xs text-ink-muted" role="alert">
              {activityProgressQuery.data ? 'Progress could not be updated.' : 'Activity progress could not be verified.'}
              <button type="button" className="ml-2 font-semibold text-accent-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => void activityProgressQuery.refetch()}>Retry</button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-5">
            <p className="text-sm font-semibold text-ink">
              Lessons
            </p>
            <div className="flex items-center gap-1 text-xs font-medium text-accent">
              <button
                type="button"
                onClick={expandAll}
                className="inline-flex min-h-9 items-center whitespace-nowrap rounded px-2 transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Expand all lessons"
              >
                Expand all
              </button>
              <span aria-hidden="true" className="text-ink-subtle">
                /
              </span>
              <button
                type="button"
                onClick={collapseAll}
                className="inline-flex min-h-9 items-center whitespace-nowrap rounded px-2 transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Collapse all lessons"
              >
                Collapse all
              </button>
            </div>
          </div>

          <nav aria-label="Course lessons" className="space-y-1">
            {lessons.map((item) => {
              const itemSections =
                item.id === lessonId ? sections : buildLessonActivitySections(item);
              return (
                <LessonModuleNavItem
                  key={item.id}
                  courseId={courseId}
                  lesson={item}
                  active={item.id === lessonId}
                  expanded={Boolean(expandedModules[item.id])}
                  onToggle={() => toggleModule(item.id)}
                  sections={itemSections}
                  completedActivityIds={completedActivityIds}
                  activityId={item.id === lessonId ? activityId : undefined}
                  pathname={location.pathname}
                />
              );
            })}
          </nav>

          <Link
            to={`/courses/${courseId}/info`}
            className="mt-4 flex items-center gap-2 rounded-lg border-t border-line px-2.5 pt-4 pb-2 text-sm font-semibold text-ink-muted transition-colors duration-150 ease-out hover:bg-sunken hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <BookOpenIcon className="h-4 w-4" /> Course Info
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LessonModuleNavItem({
  courseId,
  lesson,
  active,
  expanded,
  onToggle,
  sections,
  completedActivityIds,
  activityId,
  pathname,
}: {
  courseId: string;
  lesson: CoursePathLesson;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  sections: LessonActivitySection[];
  completedActivityIds?: string[];
  activityId?: string;
  pathname: string;
}) {
  const locked = lesson.status === 'locked';
  const statusLabel = {
    completed: 'completed',
    current: 'current lesson',
    in_progress: 'in progress',
    available: 'not started',
    locked: 'locked',
  }[lesson.status];
  const content = (
    <>
      <span
        role="img"
        aria-label={`${lesson.title}: ${statusLabel}`}
        data-lesson-status={lesson.status}
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${
          lesson.status === 'completed'
            ? 'border-ok bg-ok text-white'
            : lesson.status === 'current' || lesson.status === 'in_progress'
              ? 'border-accent bg-transparent text-accent-ink'
              : locked
                ? 'border-line-strong bg-sunken text-ink-subtle'
                : 'border-line-strong bg-surface text-ink-subtle'
        }`}
      >
        {lesson.status === 'completed' ? <CheckIcon aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
        {locked ? <LockIcon aria-hidden="true" className="h-2.5 w-2.5" strokeWidth={2.5} /> : null}
      </span>
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug"><span className="mr-1 tabular-nums text-ink-subtle">{lesson.ordinal}.</span>{lesson.title}</span>
    </>
  );

  const panelId = `course-module-${lesson.id}`;

  return (
    <section className="overflow-hidden rounded-lg">
      <div className="flex items-center gap-1 px-1 py-1">
        {locked ? (
          <div
            aria-current={active && !activityId ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-muted cursor-default"
            title={lesson.lockReason?.message}
          >
            {content}
          </div>
        ) : (
          <Link
            aria-current={active && !activityId ? 'page' : undefined}
            to={`/courses/${courseId}/lessons/${lesson.id}`}
            className={`group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'bg-sunken font-semibold text-ink' : 'text-ink hover:bg-sunken hover:text-accent'
            }`}
          >
            {content}
          </Link>
        )}

        <button
          type="button"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${lesson.title}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded text-ink-muted transition-colors duration-150 ease-out hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      <div
        id={panelId}
        hidden={!expanded}
        style={!expanded ? { display: 'none' } : undefined}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-l border-line pb-4 pl-3 pr-1 pt-2 text-xs">
            {locked && lesson.lockReason && (
              <p className="flex items-start gap-1.5 py-1.5 text-ink-muted">
                <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                <span>{lesson.lockReason.message}</span>
              </p>
            )}

            {sections.length > 0 && (
              <div className="space-y-5 pt-1">
                {sections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="px-2 pt-1 text-xs font-medium text-ink-muted">
                      {section.title}
                    </p>
                    <div className="space-y-1 pl-1">
                      {section.items.map((activity) => {
                        const isSelected =
                          active &&
                          (activity.id === activityId || pathname.endsWith(`/${activity.id}`));
                        const unavailable = locked || activity.status === 'unavailable';

                        return (
                          <div key={activity.id} className={isSelected ? 'border-l-2 border-accent' : ''} title={unavailable ? (lesson.lockReason?.message ?? 'Activity unavailable') : undefined}>
                            <ActivityCard
                              activity={activity}
                              href={unavailable ? undefined : `/courses/${courseId}/lessons/${lesson.id}/activities/${activity.id}`}
                              completion={unavailable ? 'locked' : completedActivityIds ? activityCompletionState(activity.id, { completedActivityIds }) : 'checking'}
                              active={isSelected}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
