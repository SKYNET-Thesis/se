import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeftIcon, FileQuestionIcon, PuzzleIcon } from 'lucide-react';
import { catalogApi, learnerApi, type ApiRecord } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';

interface LessonData { id: string; courseId: string; title: string; summary: string; ordinal: number; }
function parseLesson(value: ApiRecord): LessonData | null {
  if (typeof value.id !== 'string' || typeof value.course_id !== 'string' || typeof value.title !== 'string') return null;
  const content = value.content && typeof value.content === 'object' ? value.content as Record<string, unknown> : {};
  return { id: value.id, courseId: value.course_id, title: value.title, summary: typeof content.summary === 'string' ? content.summary : '', ordinal: typeof value.ordinal === 'number' ? value.ordinal : 0 };
}

export function LessonViewer() {
  const { courseId = '', lessonId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useSupabaseSession();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session || !lessonId) return;
    let active = true; setLoading(true); setError(null);
    void catalogApi.lesson(lessonId, session.access_token).then((result) => {
      const parsed = parseLesson(result); if (!parsed || parsed.courseId !== courseId) throw new Error('Lesson does not belong to this course.'); if (active) setLesson(parsed);
    }).catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load this lesson.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, lessonId, session]);
  useEffect(() => load(), [load]);

  const startPractice = async () => {
    if (!session || !lesson) return;
    setStarting(true); setStartError(null);
    try {
      const classrooms = await learnerApi.classrooms(session.access_token);
      const assignments = (await Promise.all(classrooms.items.map((classroom) => learnerApi.assignments(classroom.id, session.access_token)))).flat();
      const assignment = assignments.find((item) => item.lesson_id === lesson.id && item.status === 'published');
      if (!assignment) throw new Error('This lesson does not have an available practice assignment yet.');
      const attempts = await learnerApi.attempts(session.access_token);
      const existing = attempts.find((attempt) => attempt.classroom_assignment_id === assignment.id && attempt.status !== 'submitted');
      const attempt = existing ?? await learnerApi.createAttempt(assignment.id, session.access_token);
      navigate(`/practice/${attempt.id}`);
    } catch (requestError) { setStartError(requestError instanceof Error ? requestError.message : 'Could not start practice.'); }
    finally { setStarting(false); }
  };

  if (loading) return <div className="mx-auto w-full max-w-[900px] px-4 py-10 text-sm text-ink-muted md:px-8">Loading lesson…</div>;
  if (error || !lesson) return <EmptyState icon={<FileQuestionIcon />} title="Lesson unavailable" description={error ?? 'This lesson may no longer be available to your account.'} action={<div className="flex gap-2"><Button variant="secondary" onClick={load}>Try again</Button><LinkButton to={`/courses/${courseId}`}>Back to course</LinkButton></div>} />;

  return <div className="mx-auto grid w-full max-w-[1060px] gap-10 px-4 py-6 md:px-8 md:py-9 lg:grid-cols-[minmax(0,1fr)_280px]">
    <article className="min-w-0 max-w-[700px]"><Link to={`/courses/${courseId}`} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><ChevronLeftIcon className="h-4 w-4" /> Course</Link><p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-subtle">Lesson {lesson.ordinal || 1}</p><h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-ink">{lesson.title}</h1>{lesson.summary && <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">{lesson.summary}</p>}<section className="mt-8 border-y border-line py-5"><h2 className="text-sm font-semibold text-ink">Your mission</h2><p className="mt-2 text-[15px] leading-relaxed text-ink-muted">Select the left arm. Open its gripper, wait at least one second, then close it.</p></section></article>
    <aside className="rounded-xl border border-line bg-surface p-5 lg:mt-10"><PuzzleIcon className="h-5 w-5 text-accent" /><h2 className="mt-3 text-sm font-semibold text-ink">Practice this lesson</h2><p className="mt-1 text-[13px] leading-relaxed text-ink-muted">Your workspace and progress are saved to your VISTA assignment.</p>{startError && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{startError}</p>}<Button variant="primary" className="mt-4 w-full" onClick={() => void startPractice()} loading={starting}>Start practice</Button></aside>
  </div>;
}
