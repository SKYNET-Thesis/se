import React from 'react';
import { ArrowRightIcon, PuzzleIcon } from 'lucide-react';
import { useLearning } from '../../contexts/LearningContext';
import { LinkButton } from '../ui/LinkButton';
import { ProgressBar } from '../ui/ProgressBar';

const LAB_IMAGE = "/f1e549fc-e7d6-43ff-9707-4f443e3ba27c.jpg";

export function ContinueLearning() {
  const { courses, lastLesson, completedLessons, courseProgress } = useLearning();
  const course = courses.find((c) => c.id === lastLesson?.courseId) ?? courses[0];
  if (!course) return null;
  const lesson = course.lessons.find((l) => l.id === lastLesson?.lessonId) ?? course.lessons.find((l) => !completedLessons.includes(l.id)) ?? course.lessons[0];
  const progress = courseProgress(course);
  const index = course.lessons.findIndex((l) => l.id === lesson?.id);

  return (
    <section aria-labelledby="continue-heading" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid md:grid-cols-[1.05fr_1fr]">
        <div className="relative aspect-[16/10] md:aspect-auto">
          <img src={LAB_IMAGE} alt="Dual-arm educational robot on a lab table with coloured cubes" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="flex flex-col p-6 lg:p-7">
          <p className="text-[13px] text-ink-muted">
            Continue learning · <span className="font-medium text-ink">{course.code}</span> {course.title}
          </p>
          {lesson &&
          <>
              <h2 id="continue-heading" className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {lesson.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{lesson.summary}</p>
              <p className="mt-3 text-xs text-ink-subtle">
                Lesson {index + 1} of {course.lessons.length} · {lesson.minutes} min
              </p>
            </>
          }
          <div className="mt-auto pt-6">
            <div className="mb-2 flex justify-between text-xs text-ink-muted">
              <span>Course progress</span>
              <span className="tabular">
                {progress.done}/{progress.total} lessons
              </span>
            </div>
            <ProgressBar value={progress.pct} label={`${course.title} progress`} />
            <div className="mt-5 flex flex-wrap gap-2">
              {lesson &&
              <LinkButton to={`/courses/${course.id}/lessons/${lesson.id}`} variant="primary" icon={<ArrowRightIcon className="h-4 w-4" />}>
                  Continue lesson
                </LinkButton>
              }
              <LinkButton to="/studio" variant="secondary" icon={<PuzzleIcon className="h-4 w-4" />}>
                Open Studio
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </section>);

}