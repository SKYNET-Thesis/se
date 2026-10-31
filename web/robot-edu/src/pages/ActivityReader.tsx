import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowRightIcon, FileTextIcon, LockIcon } from 'lucide-react';
import { CourseLearningShell } from '../components/learning/CourseLearningShell';
import { buildLessonActivities } from '../components/learning/lessonActivities';
import { catalogApi } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { studentLearningKeys } from '../queries/studentLearningQueries';
import { Badge } from '../components/ui/Badge';

export function ActivityReader() {
  const { courseId = '', lessonId = '', activityId = '' } = useParams();
  const navigate = useNavigate();
  const { session, sessionRevision } = useSupabaseSession();
  const query = useQuery({ queryKey: studentLearningKeys.lessonDetail(lessonId, session?.user.id, sessionRevision), queryFn: () => catalogApi.lessonDetail(lessonId, session?.access_token ?? ''), enabled: Boolean(session?.access_token && lessonId) });
  if (query.isLoading) return <div className="mx-auto max-w-4xl px-6 py-16"><div className="h-8 w-2/3 animate-pulse rounded bg-sunken" /><div className="mt-6 h-32 animate-pulse rounded bg-sunken" /></div>;
  if (!query.data) return <div className="p-10 text-sm text-ink-muted">Activity unavailable.</div>;
  const lesson = query.data;
  if (lesson.status === 'locked') return <CourseLearningShell courseId={courseId} lessonId={lessonId} lesson={lesson}><div className="rounded-xl border border-line bg-surface p-8"><LockIcon className="h-6 w-6 text-warn" /><h1 className="mt-3 text-2xl font-bold">Lesson locked</h1><p className="mt-2 text-ink-muted">{lesson.lockReason?.message}</p></div></CourseLearningShell>;
  const activities = buildLessonActivities(lesson);
  const index = activities.findIndex((item) => item.id === activityId);
  const activity = activities[index] ?? activities[0];
  const go = (offset: number) => { const next = activities[index + offset]; if (next) navigate(`/courses/${courseId}/lessons/${lessonId}/activities/${next.id}`); };
  return <CourseLearningShell courseId={courseId} lessonId={lessonId} lesson={lesson}><main className="min-h-[70vh] px-1 py-4 md:px-6 md:py-8"><Link to={`/courses/${courseId}/lessons/${lessonId}`} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink"><ArrowLeftIcon className="h-4 w-4" /> Module overview</Link><header className="mt-8 border-b border-line pb-6"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">{lesson.course_title} · C1-L{lesson.ordinal}</p><h1 className="mt-2 text-4xl font-bold text-ink">{activity.title}</h1><div className="mt-3 flex items-center gap-2"><Badge tone="accent">{activity.type.replace('_', ' ')}</Badge>{activity.durationMinutes && <span className="text-sm text-ink-muted">{activity.durationMinutes} min</span>}</div></header><article className="mx-auto mt-10 max-w-3xl space-y-6 text-[17px] leading-8 text-ink"><h2 className="text-2xl font-semibold">{activity.type === 'reading' ? 'Learn the concept' : activity.type === 'demonstration' ? 'See the concept in action' : 'Activity workspace'}</h2><p>{activity.description}</p>{lesson.content?.conceptSections?.map((section) => <section key={section.title}><h3 className="text-xl font-semibold">{section.title}</h3><p>{section.content}</p></section>)}{activity.action === 'practice' && <Link to={`/practice/${lesson.activeAttempt?.id ?? lesson.assignment?.classroomAssignmentId ?? ''}`} className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white">Open practice workspace</Link>}</article><nav className="mt-12 flex justify-between border-t border-line pt-5"><button type="button" disabled={index <= 0} onClick={() => go(-1)} className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40">← Previous</button><button type="button" disabled={index < 0 || index >= activities.length - 1} onClick={() => go(1)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40">Next item →</button></nav></main></CourseLearningShell>;
}
