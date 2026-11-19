import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LockIcon, CheckCircle2Icon, PlayCircleIcon, CircleDotIcon } from 'lucide-react';
import { catalogApi, type ApiLearningPath } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { LevelBadge, TagChips, isAcademicLevel } from '../components/academic/LevelBadge';

const STATE_LABEL = { completed: 'Completed', in_progress: 'In progress', available: 'Ready to start', locked: 'Locked' } as const;

/** BEGINNER → INTERMEDIATE → ADVANCED progression for the student's enrolled courses. No robot hardware or AI model is required for beginner courses. */
export function LearningPath() {
  const { session } = useSupabaseSession();
  const [path, setPath] = useState<ApiLearningPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    let active = true;
    catalogApi.learningPath(session.access_token).then((result) => { if (active) setPath(result); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load your learning path.'); });
    return () => { active = false; };
  }, [session]);

  return <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-9">
    <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">My learning path</h1>
    <p className="mt-1 text-sm text-ink-muted">Work through Beginner, Intermediate and Advanced courses in order. Beginner courses need no robot and no AI model.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    {!path && !error && <div className="mt-6 h-40 animate-pulse rounded-xl border border-line bg-sunken/60" aria-busy="true" aria-label="Loading learning path" />}
    {path && path.courses.length === 0 && <div className="mt-6"><EmptyState icon={<CircleDotIcon />} title="No courses on your path yet" description="Ask your school administrator to enroll you in a course." /></div>}
    {path && path.courses.length > 0 && <>
      <ol aria-label="Level progress" className="mt-6 grid gap-3 sm:grid-cols-3">{path.levels.map((level) => <li key={level.code} className="rounded-xl border border-line bg-surface p-4">
        <LevelBadge level={level.code} /><p className="mt-2 text-sm text-ink-muted">{level.completed} of {level.total} course{level.total === 1 ? '' : 's'} completed</p></li>)}</ol>
      {path.recommendedNext && <section aria-label="Recommended next course" className="mt-6 rounded-xl border border-[#b8d9d3] bg-[#effaf7] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Recommended next</p>
        <p className="mt-1 text-lg font-semibold text-ink">{path.recommendedNext.title}</p>
        <p className="text-sm text-ink-muted">{path.recommendedNext.reason}</p>
        <Link to={`/courses/${path.recommendedNext.id}`} className="mt-3 inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white">Open course</Link></section>}
      <ul className="mt-6 space-y-3" aria-label="Courses by level">{path.courses.map((course) => <li key={course.id} data-state={course.state} className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2"><LevelBadge level={isAcademicLevel(course.level) ? course.level : null} /><span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
          {course.state === 'completed' ? <CheckCircle2Icon className="h-3.5 w-3.5" /> : course.state === 'locked' ? <LockIcon className="h-3.5 w-3.5" /> : <PlayCircleIcon className="h-3.5 w-3.5" />}{STATE_LABEL[course.state]}</span></div>
        <h2 className="mt-2 text-lg font-semibold text-ink">{course.title}</h2>
        <TagChips tags={course.tags} />
        <div className="mt-3"><ProgressBar value={course.progressPercent} label={`${course.title} progress`} /><p className="mt-1 text-xs text-ink-subtle">{course.completedLessons} of {course.totalLessons} lessons · {course.progressPercent}%</p></div>
        {course.lockedReason && <p className="mt-2 text-sm text-ink-muted" role="note">{course.lockedReason}</p>}
        <Link to={`/courses/${course.id}`} className="mt-3 inline-block text-sm font-medium text-accent-ink underline">{course.state === 'completed' ? 'Review course' : 'Open course'}</Link>
      </li>)}</ul></>}
  </main>;
}
