import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, FileQuestionIcon, LockIcon } from 'lucide-react';
import { catalogApi } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';
import { CourseLearningShell } from '../components/learning/CourseLearningShell';
import { LessonActivitySections } from '../components/learning/LessonActivitySections';

export function LessonViewer() {
  const { courseId = '', lessonId = '' } = useParams<{ courseId: string; lessonId: string }>();
  const { session, loading: authLoading, sessionRevision } = useSupabaseSession();
  const lessonQuery = useQuery({ queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user?.id, sessionRevision), queryFn: () => catalogApi.lessonDetail(lessonId, session?.access_token ?? ''), enabled: Boolean(session?.access_token && lessonId) });
  const lesson = lessonQuery.data;
  if (authLoading || (lessonQuery.isLoading && !lesson)) return <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-20 text-sm text-ink-muted">Loading lesson…</div>;
  if (lessonQuery.isError || !lesson) return <EmptyState icon={<FileQuestionIcon className="h-10 w-10 text-warn" />} title="Lesson unavailable" description={lessonQuery.error instanceof Error ? lessonQuery.error.message : 'This lesson could not be loaded.'} action={<LinkButton to={`/courses/${courseId}`}>Back to Course Path</LinkButton>} />;
  const locked = lesson.status === 'locked';
  const status = lesson.status === 'completed' ? 'Completed' : locked ? 'Locked' : lesson.status === 'in_progress' ? 'In progress' : 'Current';
  return <CourseLearningShell courseId={courseId} lessonId={lessonId} lesson={lesson}><main className="mx-auto w-full px-0 py-2 md:py-4"><nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-ink-muted"><Link to={`/courses/${courseId}`} className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeftIcon className="h-4 w-4" />{lesson.course_title || 'Course Path'}</Link><span aria-hidden="true">/</span><span className="font-semibold text-ink">C1-L{lesson.ordinal} — {lesson.title}</span></nav><header className="mt-6 border-b border-line pb-6"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">Learning module</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold tracking-tight text-ink">C1-L{lesson.ordinal} — {lesson.title}</h1><Badge tone={locked ? 'neutral' : lesson.status === 'completed' ? 'ok' : 'accent'}>{status}</Badge></div>{lesson.content?.summary && <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-muted">{lesson.content.summary}</p>}{lesson.content?.completionCriteria && !locked && <p className="mt-4 text-sm text-ink-muted">Completion: {lesson.content.completionCriteria}</p>}</header>{locked ? <section className="mt-8 rounded-xl border border-line bg-surface p-6"><LockIcon className="h-5 w-5 text-warn" /><h2 className="mt-3 font-bold text-ink">This lesson is locked</h2><p className="mt-1 text-sm text-ink-muted">{lesson.lockReason?.message ?? 'Complete prerequisite lessons to unlock this lesson.'}</p></section> : <LessonActivitySections lesson={lesson} />}</main></CourseLearningShell>;
}
