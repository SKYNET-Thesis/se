import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownIcon, ArrowUpIcon, LibraryIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Course, Lesson } from '../../types/learning';
import { useLearning } from '../../contexts/LearningContext';
import { CourseEditorForm } from '../../components/teacher/CourseEditorForm';
import { LessonEditorDialog } from '../../components/teacher/LessonEditorDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { DemoTag } from '../../components/ui/DemoTag';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { createId } from '../../utils/id';
import { cn } from '../../utils/cn';

const DEFAULT_IMAGE = "/0afeddbc-ceca-4316-bdb8-c4034c57dc33.jpg";

export function TeacherCourses() {
  const { courses, upsertCourse, deleteCourse, upsertLesson, deleteLesson } = useLearning();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id') ?? courses[0]?.id;
  const course = courses.find((c) => c.id === selectedId);
  const [lessonDialog, setLessonDialog] = useState<{open: boolean;lesson: Lesson | null;}>({ open: false, lesson: null });
  const [confirm, setConfirm] = useState<{kind: 'course';} | {kind: 'lesson';lesson: Lesson;} | null>(null);

  const select = (id: string) => setParams({ id });

  const createCourse = () => {
    const c: Course = {
      id: createId('course'),
      code: 'ROB 300',
      title: 'Untitled course',
      summary: 'Describe what students will learn in this course.',
      level: 'Introductory',
      image: DEFAULT_IMAGE,
      imageAlt: 'Robot arm joint',
      instructor: 'Daniel Reyes',
      published: false,
      lessons: []
    };
    upsertCourse(c);
    select(c.id);
    toast.success('Draft course created');
  };

  const move = (index: number, dir: -1 | 1) => {
    if (!course) return;
    const lessons = [...course.lessons];
    const target = index + dir;
    if (target < 0 || target >= lessons.length) return;
    [lessons[index], lessons[target]] = [lessons[target], lessons[index]];
    upsertCourse({ ...course, lessons });
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        eyebrow={<DemoTag label="Saved in this browser" />}
        title="Courses & lessons"
        description="Edit course details, publish to students and arrange lessons."
        actions={
        <Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={createCourse}>
            New course
          </Button>
        } />
      

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Courses">
          <ul className="space-y-0.5">
            {courses.map((c) =>
            <li key={c.id}>
                <button
                type="button"
                onClick={() => select(c.id)}
                aria-current={c.id === selectedId ? 'true' : undefined}
                className={cn('w-full rounded-md px-3 py-2.5 text-left', c.id === selectedId ? 'bg-accent-soft' : 'hover:bg-sunken')}>
                
                  <span className={cn('block truncate text-sm font-medium', c.id === selectedId ? 'text-accent-ink' : 'text-ink')}>{c.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-subtle">
                    {c.code} · {c.lessons.length} lessons {!c.published && <Badge tone="outline">Draft</Badge>}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </nav>

        {!course ?
        <EmptyState icon={<LibraryIcon />} title="No course selected" description="Create a course to get started." /> :

        <div className="min-w-0 space-y-10">
            <section aria-labelledby="course-details-heading" className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="course-details-heading" className="text-[15px] font-semibold text-ink">
                  Course details
                </h2>
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" icon={<Trash2Icon className="h-4 w-4" />} onClick={() => setConfirm({ kind: 'course' })}>
                  Delete course
                </Button>
              </div>
              <CourseEditorForm
              course={course}
              onSave={(c) => {
                upsertCourse(c);
                toast.success('Course saved', { description: 'Stored in this browser’s demo data.' });
              }} />
            
            </section>

            <section aria-labelledby="lesson-list-heading">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="lesson-list-heading" className="text-[15px] font-semibold text-ink">
                  Lessons
                </h2>
                <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setLessonDialog({ open: true, lesson: null })}>
                  Add lesson
                </Button>
              </div>
              {course.lessons.length === 0 ?
            <EmptyState compact title="No lessons yet" description="Add the first lesson for this course." /> :

            <ol className="divide-y divide-line border-y border-line">
                  {course.lessons.map((l, i) =>
              <li key={l.id} className="flex items-center gap-3 py-3">
                      <span className="tabular w-6 text-sm text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{l.title}</p>
                        <p className="truncate text-xs text-ink-subtle">
                          {l.minutes} min · {l.objectives.length} objectives · {l.sections.length} sections
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUpIcon />
                        </IconButton>
                        <IconButton label="Move down" size="sm" disabled={i === course.lessons.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDownIcon />
                        </IconButton>
                        <IconButton label={`Edit ${l.title}`} size="sm" onClick={() => setLessonDialog({ open: true, lesson: l })}>
                          <PencilIcon />
                        </IconButton>
                        <IconButton label={`Delete ${l.title}`} size="sm" className="hover:bg-danger-soft hover:text-danger" onClick={() => setConfirm({ kind: 'lesson', lesson: l })}>
                          <Trash2Icon />
                        </IconButton>
                      </div>
                    </li>
              )}
                </ol>
            }
            </section>
          </div>
        }
      </div>

      <LessonEditorDialog
        open={lessonDialog.open}
        lesson={lessonDialog.lesson}
        onClose={() => setLessonDialog({ open: false, lesson: null })}
        onSave={(lesson) => {
          if (!course) return;
          upsertLesson(course.id, lesson);
          setLessonDialog({ open: false, lesson: null });
          toast.success('Lesson saved');
        }} />
      
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'lesson' ? `Delete “${confirm.lesson.title}”?` : `Delete “${course?.title}”?`}
        description={confirm?.kind === 'lesson' ? 'Students will no longer see this lesson.' : 'This also deletes the course’s assignments from demo storage.'}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!course || !confirm) return;
          if (confirm.kind === 'lesson') deleteLesson(course.id, confirm.lesson.id);else
          {
            deleteCourse(course.id);
            setParams({});
          }
          setConfirm(null);
          toast.success('Deleted');
        }} />
      
    </div>);

}