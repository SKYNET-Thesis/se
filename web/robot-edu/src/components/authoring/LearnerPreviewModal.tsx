import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenIcon,
  BotIcon,
  EyeIcon,
  FileTextIcon,
  HelpCircleIcon,
  VideoIcon,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Lesson, Section, Activity } from '../../pages/admin/CanonicalCurriculumEditor';
import { curriculumApi, type ApiCourse } from '../../lib/api';

export interface LearnerPreviewModalProps {
  open: boolean;
  onClose: () => void;
  course: ApiCourse;
  lessons: Lesson[];
  sections: Section[];
  selectedLessonId?: string;
  /** Needed only to load the saved sections of a lesson other than `selectedLessonId`. */
  token?: string;
}

export function LearnerPreviewModal({
  open,
  onClose,
  course,
  lessons,
  sections,
  selectedLessonId,
  token = '',
}: LearnerPreviewModalProps) {
  const [pickedLessonId, setPickedLessonId] = useState<string | null>(null);
  const [activeActivity, setActiveActivity] = useState<Activity | null>(null);

  // The modal stays mounted while closed: forget the learner-view navigation on close so the next open starts on the
  // lesson currently selected in the editor (derived below, never a value captured at mount).
  useEffect(() => {
    if (open) return;
    setPickedLessonId(null);
    setActiveActivity(null);
  }, [open]);

  const activeLessonId = pickedLessonId ?? selectedLessonId ?? lessons[0]?.id ?? '';
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0];
  // `sections` only describes the lesson open in the editor. Any other lesson shown here must load its own saved sections
  // (same query key as the editor, so this is normally a cache hit) instead of reusing the wrong lesson's list.
  const showsEditorSections = Boolean(activeLesson) && activeLesson?.id === selectedLessonId;
  const otherLessonSections = useQuery({
    queryKey: ['curriculum', activeLesson?.id, 'sections'],
    queryFn: () => curriculumApi.sections(activeLesson!.id, token) as Promise<Section[]>,
    enabled: open && Boolean(activeLesson) && !showsEditorSections && Boolean(token),
    staleTime: 30_000,
  });
  const visibleSections: Section[] = showsEditorSections ? sections : otherLessonSections.data ?? [];
  const sectionsLoading = !showsEditorSections && otherLessonSections.isLoading;

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <VideoIcon className="h-4 w-4 text-blue-500" />;
      case 'reading':
        return <FileTextIcon className="h-4 w-4 text-emerald-500" />;
      case 'knowledge_check':
        return <HelpCircleIcon className="h-4 w-4 text-amber-500" />;
      case 'simulation':
      case 'challenge':
      case 'guided_practice':
        return <BotIcon className="h-4 w-4 text-purple-500" />;
      default:
        return <BookOpenIcon className="h-4 w-4 text-ink-muted" />;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="View as Learner"
      description="Preview how enrolled students will experience this course structure, content and activities."
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-xs text-ink-muted">
            Learner View • Student answers and private answer keys remain protected.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Exit Learner View
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Learner Experience Banner */}
        <div className="rounded-lg border border-accent/20 bg-accent-soft/40 p-3 text-xs text-ink flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-4 w-4 text-accent-ink shrink-0" />
            <span>
              <strong>Student View Mode:</strong> You are seeing the published curriculum flow and activity sequence.
            </span>
          </div>
          <Badge tone="ok">Student Preview</Badge>
        </div>

        {/* 2-Column Learner View */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left: Course Syllabus Navigation */}
          <div className="rounded-xl border border-line bg-surface p-4 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-ink">{course.title}</h4>
              <p className="text-2xs text-ink-muted line-clamp-2 mt-0.5">
                {course.description || 'No description provided.'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink-subtle">
                Lessons
              </span>
              <div className="space-y-1">
                {lessons.map((les, i) => {
                  const isCurrent = activeLesson?.id === les.id;
                  return (
                    <button
                      key={les.id}
                      type="button"
                      onClick={() => {
                        setPickedLessonId(les.id);
                        setActiveActivity(null);
                      }}
                      className={`w-full text-left rounded-lg p-2.5 text-xs transition-colors ${
                        isCurrent
                          ? 'bg-accent-soft text-accent-ink font-semibold'
                          : 'hover:bg-sunken text-ink-muted'
                      }`}
                    >
                      <span className="text-2xs font-mono text-ink-subtle mr-1.5">
                        {i + 1}.
                      </span>
                      {les.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Active Lesson Content & Section Activities */}
          <div className="md:col-span-2 space-y-4">
            {activeLesson ? (
              <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
                <div className="border-b border-line pb-3">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-accent-ink">
                    Current Lesson
                  </span>
                  <h3 className="text-lg font-bold text-ink">{activeLesson.title}</h3>
                  {activeLesson.content && typeof activeLesson.content.summary === 'string' && (
                    <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                      {activeLesson.content.summary}
                    </p>
                  )}
                </div>

                {/* Sections & Activities */}
                {sectionsLoading ? (
                  <p className="text-xs text-ink-muted italic py-4 text-center">Loading lesson content…</p>
                ) : visibleSections.length === 0 ? (
                  <p className="text-xs text-ink-muted italic py-4 text-center">
                    No published sections available in this lesson yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {visibleSections.map((sec) => (
                      <div key={sec.id} className="rounded-lg border border-line bg-sunken/20 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-ink uppercase tracking-wide">
                            {sec.title}
                          </h5>
                          <Badge tone={sec.status === 'published' ? 'ok' : 'neutral'}>
                            {sec.status ?? 'draft'}
                          </Badge>
                        </div>

                        {/* Activities List */}
                        <div className="space-y-1.5">
                          {(sec.learning_activities ?? []).map((act) => {
                            const isSelected = activeActivity?.id === act.id;
                            return (
                              <div
                                key={act.id}
                                onClick={() => setActiveActivity(act)}
                                className={`flex items-center justify-between rounded-md border p-2.5 text-xs cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'border-accent bg-accent-soft/30'
                                    : 'border-line bg-surface hover:bg-sunken/50'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {getActivityIcon(act.type)}
                                  <span className="font-medium text-ink">{act.title}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {act.required && (
                                    <span className="text-3xs text-ink-subtle uppercase">
                                      Required
                                    </span>
                                  )}
                                  <Badge
                                    tone={act.status === 'published' ? 'ok' : 'neutral'}
                                  >
                                    {act.status ?? 'draft'}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Activity Detail Preview */}
                {activeActivity && (
                  <div className="mt-4 rounded-lg border border-accent/30 bg-surface p-4 space-y-2">
                    <div className="flex items-center gap-2 text-accent-ink">
                      {getActivityIcon(activeActivity.type)}
                      <h6 className="font-semibold text-sm">{activeActivity.title}</h6>
                    </div>
                    <p className="text-xs text-ink-muted">
                      Activity Type: <strong className="capitalize">{activeActivity.type.replace('_', ' ')}</strong> • Learners can start or submit this activity when published.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted text-center py-8">Select a lesson to preview.</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
