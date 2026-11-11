import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  EyeIcon,
  LayersIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RocketIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  catalogApi,
  curriculumApi,
  type ApiCourse,
} from '../../lib/api';
import type { Lesson, Section, Activity } from '../../pages/admin/CanonicalCurriculumEditor';
import { CourseOutlinePanel } from './CourseOutlinePanel';
import { ReadingDocumentEditor } from './ReadingDocumentEditor';
import { VideoLessonEditor } from './VideoLessonEditor';
import { QuizAuthoringPanel } from './QuizAuthoringPanel';
import { MediaAssetLibraryModal } from './MediaAssetLibraryModal';

/** What Preview and the readiness checklist need to know about the curriculum currently open in the editor. */
export interface CurriculumSnapshot {
  lessons: Lesson[];
  sections: Section[];
  selectedLessonId?: string;
}

export interface CourseContentEditorProps {
  course: ApiCourse;
  token: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** Preview and Publish are owned by the parent so there is exactly one publish flow; the buttons render only when provided. */
  onOpenPreview?: (snapshot: CurriculumSnapshot) => void;
  onOpenPublish?: (snapshot: CurriculumSnapshot) => void;
  isArchived?: boolean;
}

/** Activity types whose content reference must be an assignment UUID (or none while the activity is still being set up). */
const EVALUATED_TYPES = new Set(['knowledge_check', 'guided_practice', 'simulation', 'challenge', 'physical_lab']);
const nextOrdinal = (items: Array<{ ordinal: number }> | undefined) => Math.max(0, ...(items ?? []).map((item) => item.ordinal)) + 1;
const apiErrorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The request failed. Please try again.');

type ActivityDraft = {
  title: string;
  type: string;
  required: boolean;
  contentRef: { kind: 'lesson_content'; key: string } | { kind: 'assignment'; id: string } | { kind: 'none' };
  content: Record<string, unknown>;
};

export function CourseContentEditor({
  course,
  token,
  onDirtyChange,
  onOpenPreview,
  onOpenPublish,
  isArchived = false,
}: CourseContentEditorProps) {
  const qc = useQueryClient();

  // Selection states
  const [selectedLessonId, setSelectedLessonId] = useState<string>();
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
  const [selectedActivityId, setSelectedActivityId] = useState<string>();

  // Activity Draft State
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [isActivityDirty, setIsActivityDirty] = useState(false);
  const lastLoadedActivityIdRef = useRef<string | null>(null);

  // Unsaved Changes Navigation Modal
  const [pendingNavigation, setPendingNavigation] = useState<{
    lessonId: string;
    sectionId?: string;
    activityId?: string;
  } | null>(null);

  // Responsive Outline Toggle (Tablet & Mobile)
  const [outlineVisible, setOutlineVisible] = useState(true);

  // Global Modals (Preview and the publish checklist live in the parent editor)
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  // Failure of a curriculum action (add lesson/section/activity); save failures are shown next to the save controls.
  const [actionError, setActionError] = useState<string | null>(null);

  // Query Lessons for Course
  const lessonsQuery = useQuery({
    queryKey: ['curriculum', course.id, 'lessons'],
    queryFn: () => catalogApi.lessons(course.id, token) as Promise<Lesson[]>,
    enabled: Boolean(course.id && token),
  });

  const lessons = lessonsQuery.data ?? [];

  // Automatically select the first lesson if none selected
  useEffect(() => {
    if (lessons.length > 0 && !selectedLessonId) {
      setSelectedLessonId(lessons[0].id);
    }
  }, [lessons, selectedLessonId]);

  // Query Sections for ALL lessons to build full Course Outline tree
  const sectionsQueries = useQueries({
    queries: lessons.map((l) => ({
      queryKey: ['curriculum', l.id, 'sections'],
      queryFn: () => curriculumApi.sections(l.id, token) as Promise<Section[]>,
      enabled: Boolean(l.id && token),
      staleTime: 30_000,
    })),
  });

  const sectionsByLesson = useMemo(() => {
    const map: Record<string, Section[]> = {};
    lessons.forEach((l, index) => {
      map[l.id] = (sectionsQueries[index]?.data as Section[]) ?? [];
    });
    return map;
  }, [lessons, sectionsQueries]);

  // Find currently active lesson, section, and activity
  const activeLesson = lessons.find((l) => l.id === selectedLessonId);
  const activeSections = selectedLessonId ? sectionsByLesson[selectedLessonId] ?? [] : [];
  const activeSection = activeSections.find((s) => s.id === selectedSectionId);

  // Find active activity across all sections of active lesson (or current section)
  const activeActivity = useMemo(() => {
    if (!selectedActivityId) return null;
    for (const sec of activeSections) {
      const found = (sec.learning_activities ?? []).find((a) => a.id === selectedActivityId);
      if (found) return found;
    }
    // Search across all lessons if not in active lesson
    for (const l of lessons) {
      const secs = sectionsByLesson[l.id] ?? [];
      for (const s of secs) {
        const found = (s.learning_activities ?? []).find((a) => a.id === selectedActivityId);
        if (found) return found;
      }
    }
    return null;
  }, [activeSections, lessons, sectionsByLesson, selectedActivityId]);

  // Select first activity automatically on load if available
  useEffect(() => {
    if (!selectedActivityId && lessons.length > 0) {
      for (const l of lessons) {
        const secs = sectionsByLesson[l.id] ?? [];
        for (const s of secs) {
          const acts = s.learning_activities ?? [];
          if (acts.length > 0) {
            setSelectedLessonId(l.id);
            setSelectedSectionId(s.id);
            setSelectedActivityId(acts[0].id);
            return;
          }
        }
      }
    }
  }, [lessons, sectionsByLesson, selectedActivityId]);

  // Initialize draft when active activity changes, protecting unsaved edits
  useEffect(() => {
    if (activeActivity) {
      if (activeActivity.id !== lastLoadedActivityIdRef.current) {
        // Switched activity: load baseline draft
        setActivityDraft({
          title: activeActivity.title,
          type: activeActivity.type,
          required: activeActivity.required,
          contentRef: activeActivity.content_ref ?? { kind: 'none' },
          content: activeActivity.content ?? {},
        });
        setIsActivityDirty(false);
        saveActivityMutation.reset(); // a failure of the previous activity must not follow the selection
        lastLoadedActivityIdRef.current = activeActivity.id;
      } else if (!isActivityDirty) {
        // Re-synced clean activity from cache/server
        setActivityDraft({
          title: activeActivity.title,
          type: activeActivity.type,
          required: activeActivity.required,
          contentRef: activeActivity.content_ref ?? { kind: 'none' },
          content: activeActivity.content ?? {},
        });
      }
      // If activeActivity.id matches and isActivityDirty is true, keep draft intact!
    } else {
      setActivityDraft(null);
      setIsActivityDirty(false);
      lastLoadedActivityIdRef.current = null;
    }
  }, [activeActivity, isActivityDirty]);

  // Notify parent on dirty change
  useEffect(() => {
    onDirtyChange?.(isActivityDirty);
  }, [isActivityDirty, onDirtyChange]);

  // Window beforeunload guard to prevent losing unsaved draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActivityDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isActivityDirty]);

  // Invalidate queries helper
  const invalidateLessons = () =>
    qc.invalidateQueries({ queryKey: ['curriculum', course.id, 'lessons'] });
  const invalidateSections = (lessonId?: string) => {
    if (lessonId) qc.invalidateQueries({ queryKey: ['curriculum', lessonId, 'sections'] });
    else qc.invalidateQueries({ queryKey: ['curriculum'] });
  };

  // Mutation: Save Activity
  const saveActivityMutation = useMutation({
    mutationFn: async ({ activityId, draft }: { activityId: string; draft: ActivityDraft }) => {
      return curriculumApi.updateActivity(activityId, token, {
        title: draft.title.trim(),
        type: draft.type,
        required: draft.required,
        contentRef: draft.contentRef,
        content: draft.content,
      });
    },
    onSuccess: async () => {
      await invalidateSections(selectedLessonId);
      setIsActivityDirty(false);
      // If there was a pending navigation waiting for save, execute it now
      if (pendingNavigation) {
        setSelectedLessonId(pendingNavigation.lessonId);
        setSelectedSectionId(pendingNavigation.sectionId);
        setSelectedActivityId(pendingNavigation.activityId);
        setPendingNavigation(null);
      }
    },
    onError: () => {
      // Preserve draft and dirty state on failure!
      // Cancel pending navigation so user stays on current editor to review error and retry
      setPendingNavigation(null);
    },
  });

  // Navigation Guard Handler
  const requestNavigation = (lessonId: string, sectionId?: string, activityId?: string) => {
    if (isActivityDirty) {
      setPendingNavigation({ lessonId, sectionId, activityId });
    } else {
      setSelectedLessonId(lessonId);
      setSelectedSectionId(sectionId);
      setSelectedActivityId(activityId);
    }
  };

  const handleDiscardAndNavigate = () => {
    if (pendingNavigation) {
      setIsActivityDirty(false);
      setSelectedLessonId(pendingNavigation.lessonId);
      setSelectedSectionId(pendingNavigation.sectionId);
      setSelectedActivityId(pendingNavigation.activityId);
      setPendingNavigation(null);
    }
  };

  const handleSaveAndNavigate = () => {
    if (selectedActivityId && activityDraft) {
      saveActivityMutation.mutate({ activityId: selectedActivityId, draft: activityDraft });
    }
  };

  const handleCancelNavigation = () => {
    setPendingNavigation(null);
  };

  // Content Draft Updates
  const handleDraftChange = (patch: {
    title: string;
    required: boolean;
    content: Record<string, unknown>;
  }) => {
    if (!activityDraft) return;
    setActivityDraft({
      ...activityDraft,
      title: patch.title,
      required: patch.required,
      content: patch.content,
    });
    setIsActivityDirty(true);
  };

  // Add Curriculum items mutations
  const addLessonMutation = useMutation({
    mutationFn: (title: string) =>
      catalogApi.createLesson(course.id, token, { title, content: { summary: '' } }),
    onSuccess: async (created) => {
      setActionError(null);
      await invalidateLessons();
      setSelectedLessonId((created as Lesson).id);
    },
    onError: (error) => setActionError(apiErrorMessage(error)),
  });

  const addSectionMutation = useMutation({
    mutationFn: ({ lessonId, title }: { lessonId: string; title: string }) =>
      curriculumApi.createSection(lessonId, token, {
        title,
        ordinal: nextOrdinal(sectionsByLesson[lessonId]),
      }),
    onSuccess: async (_, { lessonId }) => {
      setActionError(null);
      await invalidateSections(lessonId);
    },
    onError: (error) => setActionError(apiErrorMessage(error)),
  });

  const addActivityMutation = useMutation({
    mutationFn: ({ sectionId, type, title }: { sectionId: string; type: string; title: string }) => {
      const siblings = Object.values(sectionsByLesson).flat().find((section) => section.id === sectionId)?.learning_activities;
      return curriculumApi.createActivity(sectionId, token, {
        title,
        type,
        ordinal: nextOrdinal(siblings),
        required: true,
        // The backend only accepts an assignment UUID or `none` for evaluated activities. A new Quiz starts as `none`;
        // the Quiz Authoring panel then creates the canonical assignment and links its UUID when the activity is saved.
        contentRef: EVALUATED_TYPES.has(type) ? { kind: 'none' } : { kind: 'lesson_content', key: 'summary' },
        content:
          type === 'reading'
            ? { version: 1, blocks: [], mediaIds: [] }
            : type === 'video'
            ? { version: 1, videoMediaId: '', description: '' }
            : {},
      });
    },
    onSuccess: async (created) => {
      setActionError(null);
      await invalidateSections(selectedLessonId);
      setSelectedActivityId((created as Activity).id);
    },
    onError: (error) => setActionError(apiErrorMessage(error)),
  });

  // Reorder mutations
  const handleMoveLesson = async (index: number, direction: -1 | 1) => {
    if (isArchived) return;
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await catalogApi.reorderLessons(
        course.id,
        token,
        reordered.map((l) => l.id),
      );
      await invalidateLessons();
    } catch {
      // Revert handled by cache
    }
  };

  const handleMoveSection = async (lessonId: string, index: number, direction: -1 | 1) => {
    if (isArchived) return;
    const secs = sectionsByLesson[lessonId] ?? [];
    const target = index + direction;
    if (target < 0 || target >= secs.length) return;
    const reordered = [...secs];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await curriculumApi.reorderSections(
        lessonId,
        token,
        reordered.map((s) => s.id),
      );
      await invalidateSections(lessonId);
    } catch {
      // Revert handled by cache
    }
  };

  const handleMoveActivity = async (sectionId: string, index: number, direction: -1 | 1) => {
    if (isArchived) return;
    const sec = activeSections.find((s) => s.id === sectionId);
    const acts = sec?.learning_activities ?? [];
    const target = index + direction;
    if (target < 0 || target >= acts.length) return;
    const reordered = [...acts];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await curriculumApi.reorderActivities(
        sectionId,
        token,
        reordered.map((a) => a.id),
      );
      await invalidateSections(selectedLessonId);
    } catch {
      // Revert handled by cache
    }
  };

  const snapshot: CurriculumSnapshot = { lessons, sections: activeSections, selectedLessonId };

  return (
    <div className="space-y-4" data-testid="course-content-editor">
      {actionError && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {actionError}
        </p>
      )}
      {/* Proposed Subnavigation Bar matching Image 4 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="font-semibold text-ink">{course.title}</span>
          {activeLesson && (
            <>
              <ChevronRightIcon className="h-3 w-3" />
              <span>{activeLesson.title}</span>
            </>
          )}
          {activeSection && (
            <>
              <ChevronRightIcon className="h-3 w-3" />
              <span>{activeSection.title}</span>
            </>
          )}
          {activeActivity && (
            <>
              <ChevronRightIcon className="h-3 w-3" />
              <span className="font-semibold text-accent-ink">{activeActivity.title}</span>
            </>
          )}
        </div>

        {/* Studio Actions */}
        <div className="flex items-center gap-2">
          {/* Tablet/Mobile Outline Toggle */}
          <button
            type="button"
            onClick={() => setOutlineVisible((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg border border-line text-ink-muted hover:text-ink hover:bg-sunken flex items-center gap-1.5 text-xs font-medium"
            aria-label="Toggle Outline"
          >
            {outlineVisible ? <PanelLeftCloseIcon className="h-4 w-4" /> : <PanelLeftOpenIcon className="h-4 w-4" />}
            <span>{outlineVisible ? 'Hide Outline' : 'Show Outline'}</span>
          </button>

          {onOpenPreview && (
            <Button
              size="sm"
              variant="secondary"
              icon={<EyeIcon className="h-4 w-4" />}
              onClick={() => onOpenPreview(snapshot)}
            >
              Preview
            </Button>
          )}

          {onOpenPublish && (
            <Button
              size="sm"
              variant="secondary"
              icon={<RocketIcon className="h-4 w-4" />}
              disabled={isArchived || course.status !== 'draft' || isActivityDirty}
              title={isActivityDirty ? 'Save or discard your unsaved changes before publishing.' : undefined}
              onClick={() => onOpenPublish(snapshot)}
            >
              Publish
            </Button>
          )}
          {onOpenPublish && isActivityDirty && (
            <span role="status" className="text-xs text-warn-ink">Save or discard changes to publish</span>
          )}
        </div>
      </div>

      {/* Main Two-Panel Content Workspace (Image 4 Layout) */}
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Left Panel: Course Outline */}
        <div
          className={`${
            outlineVisible ? 'block' : 'hidden lg:block'
          } lg:sticky lg:top-20 max-h-[calc(100vh-140px)]`}
        >
          <CourseOutlinePanel
            courseTitle={course.title}
            lessons={lessons}
            sectionsByLesson={sectionsByLesson}
            selectedActivityId={selectedActivityId}
            selectedLessonId={selectedLessonId}
            selectedSectionId={selectedSectionId}
            onSelectActivity={(lId, sId, aId) => requestNavigation(lId, sId, aId)}
            onSelectLesson={(lId) => requestNavigation(lId)}
            onAddLesson={() => {
              const title = window.prompt('Enter Module Title:');
              if (title?.trim()) addLessonMutation.mutate(title.trim());
            }}
            onAddSection={(lId) => {
              const title = window.prompt('Enter Lesson Title:');
              if (title?.trim()) addSectionMutation.mutate({ lessonId: lId, title: title.trim() });
            }}
            onAddActivity={(sId, type) => {
              const defaultTitle =
                type === 'reading'
                  ? 'New Reading'
                  : type === 'video'
                  ? 'New Video Lesson'
                  : type === 'knowledge_check'
                  ? 'Knowledge Check'
                  : 'Practice Assignment';
              const title = window.prompt('Enter Activity Title:', defaultTitle);
              if (title?.trim()) {
                addActivityMutation.mutate({ sectionId: sId, type, title: title.trim() });
              }
            }}
            onMoveLesson={handleMoveLesson}
            onMoveSection={handleMoveSection}
            onMoveActivity={handleMoveActivity}
            isArchived={isArchived}
          />
        </div>

        {/* Right Panel: Content Workspace */}
        <main className="min-w-0" aria-label="Content workspace">
          {activeActivity && activityDraft ? (
            <div className="space-y-4">
              {/* Workspace Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 rounded-xl border border-line shadow-hairline">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-bold text-ink tracking-tight truncate">
                    {activityDraft.title || 'Untitled Activity'}
                  </h2>
                  <Badge tone="neutral" className="capitalize">
                    {activityDraft.type.replace('_', ' ')}
                  </Badge>
                  <Badge tone={activeActivity.status === 'published' ? 'ok' : 'neutral'}>
                    {activeActivity.status ?? 'draft'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span role="status" className="text-xs text-ink-muted">
                    {isActivityDirty ? 'Unsaved changes' : 'Saved'}
                  </span>
                </div>
              </div>

              {/* Dynamic Content Editor based on Activity Type */}
              {activityDraft.type === 'reading' && (
                <ReadingDocumentEditor
                  activity={{
                    id: activeActivity.id,
                    title: activityDraft.title,
                    required: activityDraft.required,
                    status: activeActivity.status,
                    content: activityDraft.content,
                  }}
                  courseId={course.id}
                  token={token}
                  onChange={handleDraftChange}
                  onSave={() =>
                    saveActivityMutation.mutate({
                      activityId: activeActivity.id,
                      draft: activityDraft,
                    })
                  }
                  onCancel={() => {
                    if (activeActivity) {
                      setActivityDraft({
                        title: activeActivity.title,
                        type: activeActivity.type,
                        required: activeActivity.required,
                        contentRef: activeActivity.content_ref ?? { kind: 'none' },
                        content: activeActivity.content ?? {},
                      });
                      setIsActivityDirty(false);
                    }
                  }}
                  isSaving={saveActivityMutation.isPending}
                  isDirty={isActivityDirty}
                  disabled={isArchived}
                  error={saveActivityMutation.error ? (saveActivityMutation.error as Error).message : null}
                />
              )}

              {activityDraft.type === 'video' && (
                <VideoLessonEditor
                  activity={{
                    id: activeActivity.id,
                    title: activityDraft.title,
                    required: activityDraft.required,
                    status: activeActivity.status,
                    content: activityDraft.content,
                  }}
                  courseId={course.id}
                  token={token}
                  onChange={handleDraftChange}
                  onSave={() =>
                    saveActivityMutation.mutate({
                      activityId: activeActivity.id,
                      draft: activityDraft,
                    })
                  }
                  onCancel={() => {
                    if (activeActivity) {
                      setActivityDraft({
                        title: activeActivity.title,
                        type: activeActivity.type,
                        required: activeActivity.required,
                        contentRef: activeActivity.content_ref ?? { kind: 'none' },
                        content: activeActivity.content ?? {},
                      });
                      setIsActivityDirty(false);
                    }
                  }}
                  isSaving={saveActivityMutation.isPending}
                  isDirty={isActivityDirty}
                  disabled={isArchived}
                  error={saveActivityMutation.error ? (saveActivityMutation.error as Error).message : null}
                />
              )}

              {activityDraft.type === 'knowledge_check' && selectedLessonId && (
                <div className="rounded-xl border border-line bg-surface p-6 shadow-sm space-y-4">
                  <header className="border-b border-line pb-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">
                        Quiz / Knowledge Check
                      </span>
                      <h3 className="text-xl font-bold text-ink mt-0.5">{activityDraft.title}</h3>
                    </div>
                  </header>
                  <QuizAuthoringPanel
                    lessonId={selectedLessonId}
                    token={token}
                    title={activityDraft.title}
                    instructions={
                      typeof activityDraft.content.instructions === 'string'
                        ? activityDraft.content.instructions
                        : ''
                    }
                    assignmentId={
                      activityDraft.contentRef.kind === 'assignment'
                        ? activityDraft.contentRef.id
                        : undefined
                    }
                    readOnly={isArchived}
                    onChange={(patch) => {
                      const next = {
                        ...activityDraft,
                        ...(patch.title !== undefined ? { title: patch.title } : {}),
                        ...(patch.instructions !== undefined
                          ? { content: { ...activityDraft.content, instructions: patch.instructions } }
                          : {}),
                        ...(patch.contentRef ? { contentRef: patch.contentRef } : {}),
                      };
                      setActivityDraft(next);
                      setIsActivityDirty(true);
                    }}
                  />
                  {saveActivityMutation.error && (
                    <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                      {apiErrorMessage(saveActivityMutation.error)}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 border-t border-line pt-3">
                    <Button
                      variant="primary"
                      onClick={() =>
                        saveActivityMutation.mutate({
                          activityId: activeActivity.id,
                          draft: activityDraft,
                        })
                      }
                      loading={saveActivityMutation.isPending}
                      disabled={isArchived || saveActivityMutation.isPending}
                    >
                      Save Quiz Activity
                    </Button>
                  </div>
                </div>
              )}

              {['guided_practice', 'simulation', 'challenge', 'physical_lab'].includes(
                activityDraft.type,
              ) && (
                <div className="rounded-xl border border-line bg-surface p-6 shadow-sm space-y-4">
                  <header className="border-b border-line pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                      Assignment Activity
                    </span>
                    <h3 className="text-xl font-bold text-ink mt-0.5">{activityDraft.title}</h3>
                  </header>

                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-ink">
                      Activity Title
                      <input
                        type="text"
                        disabled={isArchived}
                        value={activityDraft.title}
                        onChange={(e) => {
                          setActivityDraft({ ...activityDraft, title: e.target.value });
                          setIsActivityDirty(true);
                        }}
                        className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>

                    <label className="block text-sm font-medium text-ink">
                      Existing Assignment UUID
                      <input
                        type="text"
                        disabled={isArchived}
                        value={
                          activityDraft.contentRef.kind === 'assignment'
                            ? activityDraft.contentRef.id
                            : ''
                        }
                        onChange={(e) => {
                          setActivityDraft({
                            ...activityDraft,
                            contentRef: { kind: 'assignment', id: e.target.value.trim() },
                          });
                          setIsActivityDirty(true);
                        }}
                        placeholder="e.g. 11111111-1111-4111-8111-111111111111"
                        className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>

                    <label className="block text-sm font-medium text-ink">
                      Instructions
                      <textarea
                        rows={4}
                        disabled={isArchived}
                        value={
                          typeof activityDraft.content.instructions === 'string'
                            ? activityDraft.content.instructions
                            : ''
                        }
                        onChange={(e) => {
                          setActivityDraft({
                            ...activityDraft,
                            content: { ...activityDraft.content, instructions: e.target.value },
                          });
                          setIsActivityDirty(true);
                        }}
                        className="mt-1 block w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                  </div>

                  {saveActivityMutation.error && (
                    <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                      {apiErrorMessage(saveActivityMutation.error)}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 border-t border-line pt-3">
                    <Button
                      variant="primary"
                      onClick={() =>
                        saveActivityMutation.mutate({
                          activityId: activeActivity.id,
                          draft: activityDraft,
                        })
                      }
                      loading={saveActivityMutation.isPending}
                      disabled={isArchived || saveActivityMutation.isPending}
                    >
                      Save Assignment Activity
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center space-y-3">
              <LayersIcon className="h-10 w-10 text-ink-subtle mx-auto" />
              <h3 className="text-base font-bold text-ink">Select an Activity from the Course Outline</h3>
              <p className="text-xs text-ink-muted max-w-md mx-auto">
                Choose a Reading, Video, or Quiz activity from the left panel to begin editing its content, or add a new activity to an existing module.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      {pendingNavigation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-pop space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangleIcon className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-ink">Unsaved Changes</h3>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
              You have unsaved changes in{' '}
              <strong className="text-ink font-semibold">
                {activityDraft?.title || 'current activity'}
              </strong>
              . What would you like to do before navigating to another learning item?
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={handleCancelNavigation}>
                Stay Here
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="text-danger hover:bg-danger-soft"
                onClick={handleDiscardAndNavigate}
              >
                Discard Changes
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleSaveAndNavigate}
                loading={saveActivityMutation.isPending}
              >
                Save &amp; Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <MediaAssetLibraryModal
        open={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
        courseId={course.id}
        token={token}
      />
    </div>
  );
}
