import React, { useState, useEffect } from 'react';
import { BookOpenIcon, CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, MenuIcon, LockIcon } from 'lucide-react';
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

export function CourseLearningShell({
  courseId,
  lessonId,
  lesson,
  pathOverride,
  focused = false,
  activityId,
  children,
}: {
  courseId: string;
  lessonId: string;
  lesson: LessonDetailResponse;
  pathOverride?: { lessons: CoursePathLesson[] };
  focused?: boolean;
  activityId?: string;
  children: React.ReactNode;
}) {
  const { session } = useSupabaseSession();
  const location = useLocation();
  const focusedRoute = focused || /\/activities\//.test(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusedNavigatorCollapsed, setFocusedNavigatorCollapsed] = useState(false);
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
        className="inline-flex items-center gap-2 self-start rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-hairline transition-colors duration-150 ease-out hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="course-material-nav"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <MenuIcon className="h-4 w-4" /> Course Material
      </button>

      {focusedRoute && (
        <button
          type="button"
          className="hidden h-10 w-10 shrink-0 items-center justify-center self-start rounded-lg border border-line bg-surface text-ink transition-colors duration-150 ease-out hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none lg:inline-flex"
          aria-label={focusedNavigatorCollapsed ? 'Show course material' : 'Hide course material'}
          aria-expanded={!focusedNavigatorCollapsed}
          aria-controls="course-material-nav"
          onClick={() => setFocusedNavigatorCollapsed((collapsed) => !collapsed)}
        >
          <MenuIcon className="h-4 w-4" />
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
        className={`${mobileOpen ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-[min(90vw,22rem)] shrink-0 overflow-y-auto bg-surface transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:block lg:w-auto lg:overflow-visible ${
          focusedRoute
            ? focusedNavigatorCollapsed
              ? 'lg:w-0 lg:overflow-hidden lg:opacity-0'
              : 'lg:w-80 lg:opacity-100'
            : 'lg:w-72'
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
          <button type="button" aria-label="Close course material" onClick={() => setMobileOpen(false)} className="rounded-lg px-2 py-1 text-xl text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden">×</button>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
              Course Material
            </p>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-ink">
              <button
                type="button"
                onClick={expandAll}
                className="rounded px-1.5 py-1 transition-colors duration-150 ease-out hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                className="rounded px-1.5 py-1 transition-colors duration-150 ease-out hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
  const content = (
    <>
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{lesson.title}</span>
      {lesson.status === 'completed' ? (
        <CheckCircle2Icon aria-label="Completed" className="h-4 w-4 shrink-0 text-ok" />
      ) : locked ? (
        <LockIcon aria-label="Locked" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
      ) : (
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-accent-ink" />
      )}
    </>
  );

  const panelId = `course-module-${lesson.id}`;

  return (
    <section className={`overflow-hidden rounded-lg transition-colors duration-150 ease-out ${active ? 'bg-accent-soft/40' : ''}`}>
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
              active ? 'font-semibold text-accent-ink' : 'text-ink hover:bg-sunken hover:text-accent-ink'
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
                    <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
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
