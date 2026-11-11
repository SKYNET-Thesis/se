import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Reorder } from 'framer-motion';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  EyeIcon,
  FolderOpenIcon,
  GripVerticalIcon,
  InfoIcon,
  RocketIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { catalogApi, curriculumApi, type ApiCourse, type ApiRecord } from '../../lib/api';
import { AddContentMenu } from '../../components/authoring/AddContentMenu';
import { QuizQuestionEditor, type QuizQuestion } from '../../components/authoring/QuizQuestionEditor';
import { ActivityContentEditor } from '../../components/authoring/ActivityContentEditor';
import { MediaAssetLibraryModal } from '../../components/authoring/MediaAssetLibraryModal';
import { LearnerPreviewModal } from '../../components/authoring/LearnerPreviewModal';
import { ReadinessChecklistModal } from '../../components/authoring/ReadinessChecklistModal';

export type ContentRef =
  | { kind: 'lesson_content'; key: string }
  | { kind: 'assignment'; id: string }
  | { kind: 'none' };

export type Lesson = ApiRecord & {
  id: string;
  title: string;
  content?: Record<string, unknown>;
  ordinal: number;
  prerequisiteLessonIds?: string[];
};

export type Section = ApiRecord & {
  id: string;
  title: string;
  ordinal: number;
  status?: 'draft' | 'published';
  learning_activities?: Activity[];
};

export type Activity = ApiRecord & {
  id: string;
  title: string;
  type: string;
  ordinal: number;
  required: boolean;
  status?: 'draft' | 'published';
  content_ref?: ContentRef;
};

type LessonDraft = { title: string; summary: string; prerequisiteLessonIds: string[] };
type SectionDraft = { title: string };
type ActivityDraft = { title: string; type: string; required: boolean; contentRef: ContentRef };

export interface CurriculumEditorDragRef {
  reorderLessons: (newOrder: Lesson[]) => void;
  endLessonDrag: () => Promise<void>;
  reorderSections: (newOrder: Section[]) => void;
  endSectionDrag: () => Promise<void>;
  reorderActivities: (newOrder: Activity[]) => void;
  endActivityDrag: () => Promise<void>;
}

const types = [
  'reading',
  'video',
  'demonstration',
  'guided_practice',
  'knowledge_check',
  'simulation',
  'challenge',
  'physical_lab',
  'result',
  'reflection',
];

const assignmentTypes = new Set(['guided_practice', 'knowledge_check', 'simulation', 'challenge', 'physical_lab']);

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Could not save curriculum changes.');

const defaultRef = (type: string): ContentRef =>
  assignmentTypes.has(type) ? { kind: 'assignment', id: '' } : { kind: 'lesson_content', key: 'summary' };

const initialSampleQuestions: QuizQuestion[] = [
  {
    id: 'q-safety-1',
    variation: 'VARIATION 1',
    prompt: 'What safety state does the follower arm transition to when the deadman clutch is released?',
    type: 'single_choice',
    options: [
      { id: 'opt-1', text: 'Follower holds its safe pose immediately (Hold state)', feedback: 'You got it right! Releasing clutch triggers immediate safe hold.' },
      { id: 'opt-2', text: 'Follower continues executing the trajectory', feedback: 'Incorrect. Follower motion is immediately suspended.' },
      { id: 'opt-3', text: 'Follower powers off motors and collapses', feedback: 'Incorrect. The arm maintains holding torque in Hold state.' },
    ],
    correctOptionIds: ['opt-1'],
    points: 1,
    explanation: 'VISTA safety boundary requires deadman clutch release to trigger safe Hold.',
  },
  {
    id: 'q-safety-2',
    variation: 'VARIATION 1',
    prompt: 'Which coordinate frame is used as the global reference for SO-101 tabletop manipulation?',
    type: 'single_choice',
    options: [
      { id: 'opt-a', text: 'Tabletop base coordinate frame', feedback: 'Correct! All trajectory commands are defined relative to the tabletop base frame.' },
      { id: 'opt-b', text: 'End-effector gripper frame only', feedback: 'Incorrect. Gripper is the TCP, not global reference.' },
      { id: 'opt-c', text: 'Leader arm input frame', feedback: 'Incorrect. Leader and follower operate in independent kinematic frames.' },
    ],
    correctOptionIds: ['opt-a'],
    points: 1,
    explanation: 'Tabletop base coordinate frame is the canonical origin for forward kinematics.',
  },
];

export function CanonicalCurriculumEditor({
  course,
  token,
  onDirtyChange,
  dragRef,
}: {
  course: ApiCourse;
  token: string;
  onDirtyChange?: (dirty: boolean) => void;
  dragRef?: React.MutableRefObject<CurriculumEditorDragRef | null>;
}) {
  const qc = useQueryClient();
  const [lessonId, setLessonId] = useState<string>();
  const [sectionId, setSectionId] = useState<string>();
  const [activeActivityId, setActiveActivityId] = useState<string>();

  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [editId, setEditId] = useState<{ kind: 'lesson' | 'section' | 'activity'; id: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Authoring Studio Modals
  const [learnerPreviewOpen, setLearnerPreviewOpen] = useState(false);
  const [readinessChecklistOpen, setReadinessChecklistOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  // Inline Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(initialSampleQuestions);
  const [quizPassPercent, setQuizPassPercent] = useState<number>(80);

  // Transient reorder state updated during drag
  const [reorderedLessons, setReorderedLessons] = useState<Lesson[] | null>(null);
  const [reorderedSections, setReorderedSections] = useState<Section[] | null>(null);
  const [reorderedActivities, setReorderedActivities] = useState<Activity[] | null>(null);

  // Baseline and current order refs to avoid network requests during drag
  const lessonBaselineRef = useRef<Lesson[] | null>(null);
  const lessonCurrentRef = useRef<Lesson[] | null>(null);

  const sectionBaselineRef = useRef<Section[] | null>(null);
  const sectionCurrentRef = useRef<Section[] | null>(null);

  const activityBaselineRef = useRef<Activity[] | null>(null);
  const activityCurrentRef = useRef<Activity[] | null>(null);

  const isArchived = course.status === 'archived';

  const lessons = useQuery({
    queryKey: ['curriculum', course.id, 'lessons'],
    queryFn: () => catalogApi.lessons(course.id, token) as Promise<Lesson[]>,
  });

  const lessonList = reorderedLessons ?? lessons.data ?? [];
  const lesson = lessonList.find((x) => x.id === lessonId);

  const sections = useQuery({
    queryKey: ['curriculum', lessonId, 'sections'],
    queryFn: () => curriculumApi.sections(lessonId!, token) as Promise<Section[]>,
    enabled: Boolean(lessonId),
  });

  const sectionList = reorderedSections ?? sections.data ?? [];
  const section = sectionList.find((x) => x.id === sectionId);

  const activityList = reorderedActivities ?? section?.learning_activities ?? [];
  const activeActivity = activityList.find((x) => x.id === activeActivityId);

  const dirty = Boolean(lessonDraft || sectionDraft || activityDraft);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    setLessonId(undefined);
    setSectionId(undefined);
    setActiveActivityId(undefined);
    setLessonDraft(null);
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
    setNotice(null);
    setError(null);
    setReorderedLessons(null);
    setReorderedSections(null);
    setReorderedActivities(null);
    lessonBaselineRef.current = null;
    lessonCurrentRef.current = null;
    sectionBaselineRef.current = null;
    sectionCurrentRef.current = null;
    activityBaselineRef.current = null;
    activityCurrentRef.current = null;
  }, [course.id]);

  const invalidateLessons = () => qc.invalidateQueries({ queryKey: ['curriculum', course.id, 'lessons'] });
  const invalidateSections = () => qc.invalidateQueries({ queryKey: ['curriculum', lessonId, 'sections'] });

  const fail = (e: unknown) => {
    setError(errorMessage(e));
    setNotice(null);
  };

  const done = (text: string, invalidate: () => Promise<unknown>) => async () => {
    await invalidate();
    setError(null);
    setNotice(text);
  };

  const publishCourseMutation = useMutation({
    mutationFn: () => catalogApi.publishGlobalCourse(course.id, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setNotice('Course published successfully to institutional catalog.');
      setReadinessChecklistOpen(false);
    },
    onError: fail,
  });

  const addLesson = useMutation({
    mutationFn: async (x: LessonDraft) => {
      const created = (await catalogApi.createLesson(course.id, token, {
        title: x.title,
        content: { summary: x.summary },
      })) as Lesson;
      if (x.prerequisiteLessonIds.length) {
        await catalogApi.setLessonPrerequisites(created.id, token, x.prerequisiteLessonIds);
      }
      return created;
    },
    onSuccess: done('Lesson created.', invalidateLessons),
    onError: fail,
  });

  const saveLesson = useMutation({
    mutationFn: ({ id, x }: { id: string; x: LessonDraft }) =>
      Promise.all([
        catalogApi.updateLesson(id, token, { title: x.title, content: { summary: x.summary } }),
        catalogApi.setLessonPrerequisites(id, token, x.prerequisiteLessonIds),
      ]),
    onSuccess: done('Lesson saved.', invalidateLessons),
    onError: fail,
  });

  const addSection = useMutation({
    mutationFn: (x: SectionDraft) =>
      curriculumApi.createSection(lessonId!, token, {
        title: x.title,
        ordinal: (sectionList.length ?? 0) + 1,
      }),
    onSuccess: done('Section created.', invalidateSections),
    onError: fail,
  });

  const saveSection = useMutation({
    mutationFn: ({ id, x }: { id: string; x: SectionDraft }) =>
      curriculumApi.updateSection(id, token, { title: x.title }),
    onSuccess: done('Section saved.', invalidateSections),
    onError: fail,
  });

  const addActivity = useMutation({
    mutationFn: (x: ActivityDraft) =>
      curriculumApi.createActivity(sectionId!, token, {
        title: x.title,
        type: x.type,
        ordinal: (activityList.length ?? 0) + 1,
        required: x.required,
        contentRef: x.contentRef,
      }),
    onSuccess: done('Activity created.', invalidateSections),
    onError: fail,
  });

  const saveActivity = useMutation({
    mutationFn: ({ id, x }: { id: string; x: Partial<ActivityDraft> }) =>
      curriculumApi.updateActivity(id, token, {
        title: x.title,
        type: x.type,
        required: x.required,
        contentRef: x.contentRef,
      }),
    onSuccess: done('Activity saved.', invalidateSections),
    onError: fail,
  });

  const toggleSectionStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'draft' | 'published' }) =>
      curriculumApi.setSectionStatus(id, token, status),
    onSuccess: (_, vars) => {
      done(vars.status === 'published' ? 'Section published.' : 'Section unpublished.', invalidateSections)();
    },
    onError: fail,
  });

  const toggleActivityStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'draft' | 'published' }) =>
      curriculumApi.setActivityStatus(id, token, status),
    onSuccess: (_, vars) => {
      done(vars.status === 'published' ? 'Activity published.' : 'Activity unpublished.', invalidateSections)();
    },
    onError: fail,
  });

  // --- Lessons Reorder Handlers ---
  const handleLessonDragStart = () => {
    lessonBaselineRef.current = lessonList;
    lessonCurrentRef.current = lessonList;
  };

  const handleLessonReorder = (newOrder: Lesson[]) => {
    if (isArchived) return;
    if (!lessonBaselineRef.current) {
      lessonBaselineRef.current = lessonList;
    }
    lessonCurrentRef.current = newOrder;
    setReorderedLessons(newOrder);
  };

  const handleLessonDragEnd = async () => {
    if (isArchived) return;
    const baseline = lessonBaselineRef.current ?? lessons.data ?? [];
    const current = lessonCurrentRef.current ?? reorderedLessons;

    lessonBaselineRef.current = null;
    lessonCurrentRef.current = null;

    if (!current) return;

    const baselineIds = baseline.map((x) => x.id).join(',');
    const currentIds = current.map((x) => x.id).join(',');

    if (baselineIds === currentIds) {
      setReorderedLessons(null);
      return;
    }

    try {
      await catalogApi.reorderLessons(course.id, token, current.map((x) => x.id));
      qc.setQueryData(['curriculum', course.id, 'lessons'], current);
      setReorderedLessons(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedLessons(null);
      fail(e);
    }
  };

  // --- Sections Reorder Handlers ---
  const handleSectionDragStart = () => {
    sectionBaselineRef.current = sectionList;
    sectionCurrentRef.current = sectionList;
  };

  const handleSectionReorder = (newOrder: Section[]) => {
    if (isArchived || !lessonId) return;
    if (!sectionBaselineRef.current) {
      sectionBaselineRef.current = sectionList;
    }
    sectionCurrentRef.current = newOrder;
    setReorderedSections(newOrder);
  };

  const handleSectionDragEnd = async () => {
    if (isArchived || !lessonId) return;
    const baseline = sectionBaselineRef.current ?? sections.data ?? [];
    const current = sectionCurrentRef.current ?? reorderedSections;

    sectionBaselineRef.current = null;
    sectionCurrentRef.current = null;

    if (!current) return;

    const baselineIds = baseline.map((x) => x.id).join(',');
    const currentIds = current.map((x) => x.id).join(',');

    if (baselineIds === currentIds) {
      setReorderedSections(null);
      return;
    }

    try {
      await curriculumApi.reorderSections(lessonId, token, current.map((x) => x.id));
      qc.setQueryData(['curriculum', lessonId, 'sections'], current);
      setReorderedSections(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedSections(null);
      fail(e);
    }
  };

  // --- Activities Reorder Handlers ---
  const handleActivityDragStart = () => {
    activityBaselineRef.current = activityList;
    activityCurrentRef.current = activityList;
  };

  const handleActivityReorder = (newOrder: Activity[]) => {
    if (isArchived || !sectionId) return;
    if (!activityBaselineRef.current) {
      activityBaselineRef.current = activityList;
    }
    activityCurrentRef.current = newOrder;
    setReorderedActivities(newOrder);
  };

  const handleActivityDragEnd = async () => {
    if (isArchived || !sectionId) return;
    const baseline = activityBaselineRef.current ?? section?.learning_activities ?? [];
    const current = activityCurrentRef.current ?? reorderedActivities;

    activityBaselineRef.current = null;
    activityCurrentRef.current = null;

    if (!current) return;

    const baselineIds = baseline.map((x) => x.id).join(',');
    const currentIds = current.map((x) => x.id).join(',');

    if (baselineIds === currentIds) {
      setReorderedActivities(null);
      return;
    }

    try {
      await curriculumApi.reorderActivities(sectionId, token, current.map((x) => x.id));
      qc.setQueryData(['curriculum', lessonId, 'sections'], (old: Section[] | undefined) => {
        if (!old) return old;
        return old.map((s) => (s.id === sectionId ? { ...s, learning_activities: current } : s));
      });
      setReorderedActivities(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedActivities(null);
      fail(e);
    }
  };

  // Expose dragRef for testing
  useEffect(() => {
    if (dragRef) {
      dragRef.current = {
        reorderLessons: handleLessonReorder,
        endLessonDrag: handleLessonDragEnd,
        reorderSections: handleSectionReorder,
        endSectionDrag: handleSectionDragEnd,
        reorderActivities: handleActivityReorder,
        endActivityDrag: handleActivityDragEnd,
      };
    }
  });

  const moveLesson = async (i: number, d: number) => {
    if (isArchived) return;
    const prev = lessonList;
    if (!prev[i + d]) return;
    const next = [...prev];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setReorderedLessons(next);
    try {
      await catalogApi.reorderLessons(course.id, token, next.map((x) => x.id));
      qc.setQueryData(['curriculum', course.id, 'lessons'], next);
      setReorderedLessons(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedLessons(null);
      fail(e);
    }
  };

  const moveSection = async (i: number, d: number) => {
    if (isArchived || !lessonId) return;
    const prev = sectionList;
    if (!prev[i + d]) return;
    const next = [...prev];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setReorderedSections(next);
    try {
      await curriculumApi.reorderSections(lessonId, token, next.map((x) => x.id));
      qc.setQueryData(['curriculum', lessonId, 'sections'], next);
      setReorderedSections(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedSections(null);
      fail(e);
    }
  };

  const moveActivity = async (i: number, d: number) => {
    if (isArchived || !sectionId) return;
    const prev = activityList;
    if (!prev[i + d]) return;
    const next = [...prev];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setReorderedActivities(next);
    try {
      await curriculumApi.reorderActivities(sectionId, token, next.map((x) => x.id));
      qc.setQueryData(['curriculum', lessonId, 'sections'], (old: Section[] | undefined) => {
        if (!old) return old;
        return old.map((s) => (s.id === sectionId ? { ...s, learning_activities: next } : s));
      });
      setReorderedActivities(null);
      setNotice('Order saved.');
      setError(null);
    } catch (e) {
      setReorderedActivities(null);
      fail(e);
    }
  };

  const cancel = () => {
    setLessonDraft(null);
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
  };

  const submitLesson = () => {
    if (!lessonDraft?.title.trim()) return;
    const x = { ...lessonDraft, title: lessonDraft.title.trim() };
    if (editId?.kind === 'lesson') saveLesson.mutate({ id: editId.id, x });
    else addLesson.mutate(x);
    cancel();
  };

  const submitSection = () => {
    if (!sectionDraft?.title.trim()) return;
    const x = { ...sectionDraft, title: sectionDraft.title.trim() };
    if (editId?.kind === 'section') saveSection.mutate({ id: editId.id, x });
    else addSection.mutate(x);
    cancel();
  };

  const submitActivity = () => {
    if (!activityDraft?.title.trim()) return;
    let contentRef = activityDraft.contentRef;
    if (contentRef?.kind === 'assignment' && !contentRef.id?.trim()) {
      contentRef = { kind: 'none' };
    }
    const x = { ...activityDraft, title: activityDraft.title.trim(), contentRef };
    if (editId?.kind === 'activity') saveActivity.mutate({ id: editId.id, x });
    else addActivity.mutate(x);
    cancel();
  };

  const isTreeLoading = lessons.isLoading || (Boolean(lessonId) && sections.isLoading);

  return (
    <section
      className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-hairline space-y-6"
      aria-label="Canonical curriculum editor"
    >
      {/* Studio Header (Coursera Reference 3) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-ink tracking-tight">
              {course.title} curriculum
            </h2>
            <Badge
              tone={course.status === 'published' ? 'ok' : course.status === 'draft' ? 'warn' : 'neutral'}
              dot
            >
              {course.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Manage curriculum: Canonical course → lesson → section → activity authoring studio.
          </p>
        </div>

        {/* Studio Action Buttons (Coursera Reference 1, 3, 7) */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            icon={<FolderOpenIcon className="h-4 w-4" />}
            onClick={() => setMediaLibraryOpen(true)}
          >
            Asset Library
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<EyeIcon className="h-4 w-4" />}
            onClick={() => setLearnerPreviewOpen(true)}
          >
            View as Learner
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<CheckCircle2Icon className="h-4 w-4 text-ok" />}
            onClick={() => setReadinessChecklistOpen(true)}
          >
            Readiness Checklist
          </Button>

          {course.status === 'draft' && (
            <Button
              size="sm"
              variant="primary"
              icon={<RocketIcon className="h-4 w-4" />}
              onClick={() => setReadinessChecklistOpen(true)}
            >
              Review &amp; Publish
            </Button>
          )}
        </div>
      </div>

      {/* Selected Hierarchy Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-ink-subtle bg-sunken/30 rounded-lg p-2.5">
        <span className="font-semibold text-ink">{course.title}</span>
        {lesson && (
          <>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="font-medium text-accent-ink">{lesson.title}</span>
          </>
        )}
        {section && (
          <>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="font-medium text-ink">{section.title}</span>
          </>
        )}
        {activeActivity && (
          <>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="font-medium text-accent-ink">
              {activeActivity.title} ({activeActivity.type.replace('_', ' ')})
            </span>
          </>
        )}
      </div>

      {/* Lifecycle Rules Info Callout */}
      <div className="rounded-lg border border-line bg-sunken/40 p-3.5 text-xs text-ink-muted">
        <div className="flex items-start gap-2.5">
          <InfoIcon className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-ink">Curriculum Authoring &amp; Publication Lifecycle:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-ink-subtle">
              <li>
                <strong>Independent publication:</strong> Publishing a course does not automatically publish nested sections or activities. Each section and activity manages its own publishing status.
              </li>
              <li>
                <strong>Section prerequisites:</strong> An activity can only be published once its parent section is published.
              </li>
              {course.status === 'published' && (
                <li className="text-amber-700 dark:text-amber-400 font-medium">
                  <strong>Published course restrictions:</strong> If learners are actively enrolled or progress exists, structural edits (reordering, additions, and unpublishing) are locked by backend data integrity guards. Cosmetic title edits remain allowed.
                </li>
              )}
              {isArchived && (
                <li className="text-danger font-medium">
                  <strong>Archived course:</strong> This course is archived and frozen against all curriculum changes.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {isTreeLoading && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Loading curriculum…</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-accent/20 bg-accent-soft p-3 text-sm text-ink">
          {notice}
        </div>
      )}

      {/* 3-Column Hierarchy Panes */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pane 1: Lessons */}
        <Pane
          title="Lessons"
          badge={lessonList.length}
          add="Add lesson"
          disabled={isArchived}
          onAdd={() => {
            setEditId(null);
            setLessonDraft({ title: '', summary: '', prerequisiteLessonIds: [] });
          }}
        >
          {lessonList.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">No lessons yet. Add the first lesson to start.</p>
          ) : (
            <Reorder.Group
              axis="y"
              values={lessonList}
              onReorder={handleLessonReorder}
              as="div"
              className="space-y-2"
            >
              {lessonList.map((x, i) => (
                <Reorder.Item
                  key={x.id}
                  value={x}
                  as="div"
                  dragListener={!isArchived}
                  onDragStart={handleLessonDragStart}
                  onDragEnd={handleLessonDragEnd}
                  whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20 }}
                >
                  <Row
                    active={lessonId === x.id}
                    label={x.title}
                    disabled={isArchived}
                    onSelect={() => {
                      setLessonId(x.id);
                      setSectionId(undefined);
                      setActiveActivityId(undefined);
                      setReorderedSections(null);
                      setReorderedActivities(null);
                    }}
                    onEdit={() => {
                      setEditId({ kind: 'lesson', id: x.id });
                      setLessonDraft({
                        title: x.title,
                        summary: typeof x.content?.summary === 'string' ? x.content.summary : '',
                        prerequisiteLessonIds: x.prerequisiteLessonIds ?? [],
                      });
                    }}
                    onUp={() => moveLesson(i, -1)}
                    onDown={() => moveLesson(i, 1)}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </Pane>

        {/* Pane 2: Sections */}
        <Pane
          title={lesson ? 'Sections' : 'Select a lesson'}
          badge={lesson ? sectionList.length : undefined}
          add="Add section"
          disabled={!lesson || isArchived}
          onAdd={() => {
            setEditId(null);
            setSectionDraft({ title: '' });
          }}
        >
          {!lesson ? (
            <p className="py-8 text-center text-xs text-ink-muted">Select a lesson on the left to view its sections.</p>
          ) : sectionList.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">No sections yet. Click "Add section" to create one.</p>
          ) : (
            <Reorder.Group
              axis="y"
              values={sectionList}
              onReorder={handleSectionReorder}
              as="div"
              className="space-y-2"
            >
              {sectionList.map((x, i) => (
                <Reorder.Item
                  key={x.id}
                  value={x}
                  as="div"
                  dragListener={!isArchived}
                  onDragStart={handleSectionDragStart}
                  onDragEnd={handleSectionDragEnd}
                  whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20 }}
                >
                  <Row
                    active={sectionId === x.id}
                    label={x.title}
                    disabled={isArchived}
                    badge={
                      <Badge
                        tone={x.status === 'published' ? 'ok' : 'neutral'}
                        dot
                      >
                        {x.status ?? 'draft'}
                      </Badge>
                    }
                    statusAction={{
                      label: x.status === 'published' ? 'Unpublish' : 'Publish',
                      onClick: () =>
                        toggleSectionStatus.mutate({
                          id: x.id,
                          status: x.status === 'published' ? 'draft' : 'published',
                        }),
                      loading: toggleSectionStatus.isPending,
                    }}
                    onSelect={() => {
                      setSectionId(x.id);
                      setActiveActivityId(undefined);
                      setReorderedActivities(null);
                    }}
                    onEdit={() => {
                      setEditId({ kind: 'section', id: x.id });
                      setSectionDraft({ title: x.title });
                    }}
                    onUp={() => moveSection(i, -1)}
                    onDown={() => moveSection(i, 1)}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </Pane>

        {/* Pane 3: Activities */}
        <Pane
          title={section ? 'Activities' : 'Select a section'}
          badge={section ? activityList.length : undefined}
          add="Add activity"
          disabled={!section || isArchived}
          onAdd={() => {
            setEditId(null);
            setActivityDraft({ title: '', type: 'reading', required: true, contentRef: defaultRef('reading') });
          }}
        >
          {/* Quick Add Content Menu (Coursera Reference 2, 3, 4, 5) */}
          {section && (
            <div className="mb-3 border-b border-line pb-2.5">
              <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
                Quick Add Content
              </span>
              <AddContentMenu
                disabled={isArchived}
                onSelectType={(selectedType) => {
                  setEditId(null);
                  setActivityDraft({
                    title: `New ${selectedType.replace('_', ' ')}`,
                    type: selectedType,
                    required: true,
                    contentRef: defaultRef(selectedType),
                  });
                }}
              />
            </div>
          )}

          {!section ? (
            <p className="py-8 text-center text-xs text-ink-muted">Select a section to view its activities.</p>
          ) : activityList.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">No activities yet. Click "Add activity" to create one.</p>
          ) : (
            <Reorder.Group
              axis="y"
              values={activityList}
              onReorder={handleActivityReorder}
              as="div"
              className="space-y-2"
            >
              {activityList.map((x, i) => (
                <Reorder.Item
                  key={x.id}
                  value={x}
                  as="div"
                  dragListener={!isArchived}
                  onDragStart={handleActivityDragStart}
                  onDragEnd={handleActivityDragEnd}
                  whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20 }}
                >
                  <Row
                    active={activeActivityId === x.id}
                    label={`${x.title} · ${x.type}`}
                    disabled={isArchived}
                    badge={
                      <Badge
                        tone={x.status === 'published' ? 'ok' : 'neutral'}
                        dot
                      >
                        {x.status ?? 'draft'}
                      </Badge>
                    }
                    statusAction={{
                      label: x.status === 'published' ? 'Unpublish' : 'Publish',
                      onClick: () =>
                        toggleActivityStatus.mutate({
                          id: x.id,
                          status: x.status === 'published' ? 'draft' : 'published',
                        }),
                      loading: toggleActivityStatus.isPending,
                    }}
                    onSelect={() => {
                      setActiveActivityId(x.id);
                    }}
                    onEdit={() => {
                      setActiveActivityId(x.id);
                      setEditId({ kind: 'activity', id: x.id });
                      setActivityDraft({
                        title: x.title,
                        type: x.type,
                        required: x.required,
                        contentRef: x.content_ref ?? defaultRef(x.type),
                      });
                    }}
                    onUp={() => moveActivity(i, -1)}
                    onDown={() => moveActivity(i, 1)}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </Pane>
      </div>

      {/* Center Studio Content Editor Area */}
      {activeActivity && (
        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-hairline space-y-4"
          aria-label="Active activity editor workspace"
        >
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
                Authoring Studio
              </span>
              <h3 className="text-lg font-bold text-ink">
                Content Editor: {activeActivity.title}
              </h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveActivityId(undefined)}
            >
              Close Editor
            </Button>
          </div>

          {activeActivity.type === 'knowledge_check' ? (
            /* Quiz Question Editor (Coursera Reference 6) */
            <QuizQuestionEditor
              quizTitle={activeActivity.title}
              instructions="Answer each question. Passing score evaluates knowledge on robotics fundamentals."
              passPercent={quizPassPercent}
              isGraded={false}
              questions={quizQuestions}
              disabled={isArchived}
              onChangePassPercent={setQuizPassPercent}
              onChangeQuestions={setQuizQuestions}
            />
          ) : (
            /* Rich Activity Editor for Video, Reading, Labs */
            <ActivityContentEditor
              activity={{
                ...activeActivity,
                content_ref: activeActivity.content_ref,
              }}
              disabled={isArchived}
              isLoading={saveActivity.isPending}
              onSave={(patch) => {
                const payload: Partial<ActivityDraft> = {};
                if (patch.title !== undefined) payload.title = patch.title;
                if (patch.type !== undefined && patch.type !== activeActivity.type) payload.type = patch.type;
                if (patch.required !== undefined && patch.required !== activeActivity.required) payload.required = patch.required;
                if (patch.contentRef !== undefined && JSON.stringify(patch.contentRef) !== JSON.stringify(activeActivity.content_ref)) {
                  payload.contentRef = patch.contentRef;
                }
                saveActivity.mutate({
                  id: activeActivity.id,
                  x: payload,
                });
              }}
            />
          )}
        </section>
      )}

      {/* Dialogs */}
      <LessonDialog
        draft={lessonDraft}
        lessons={lessonList}
        editingId={editId?.kind === 'lesson' ? editId.id : null}
        onChange={setLessonDraft}
        onClose={cancel}
        onSave={submitLesson}
        loading={addLesson.isPending || saveLesson.isPending}
      />
      <SectionDialog
        draft={sectionDraft}
        editing={editId?.kind === 'section'}
        onChange={setSectionDraft}
        onClose={cancel}
        onSave={submitSection}
        loading={addSection.isPending || saveSection.isPending}
      />
      <ActivityDialog
        draft={activityDraft}
        editing={editId?.kind === 'activity'}
        onChange={setActivityDraft}
        onClose={cancel}
        onSave={submitActivity}
        loading={addActivity.isPending || saveActivity.isPending}
      />

      {/* Global Modals */}
      <LearnerPreviewModal
        open={learnerPreviewOpen}
        onClose={() => setLearnerPreviewOpen(false)}
        course={course}
        lessons={lessonList}
        sections={sectionList}
        selectedLessonId={lessonId}
      />

      <ReadinessChecklistModal
        open={readinessChecklistOpen}
        onClose={() => setReadinessChecklistOpen(false)}
        course={course}
        lessons={lessonList}
        sections={sectionList}
        onPublish={() => publishCourseMutation.mutate()}
        isPublishing={publishCourseMutation.isPending}
      />

      <MediaAssetLibraryModal
        open={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
      />
    </section>
  );
}

function Pane({
  title,
  badge,
  add,
  onAdd,
  disabled,
  children,
}: {
  title: string;
  badge?: number;
  add: string;
  onAdd: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface p-3.5 shadow-hairline">
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {typeof badge === 'number' && (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-2xs font-medium text-ink-muted">
              {badge}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={onAdd}>
          {add}
        </Button>
      </div>
      <div className="mt-3 space-y-2 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({
  label,
  onSelect,
  onEdit,
  onUp,
  onDown,
  active,
  disabled,
  badge,
  statusAction,
}: {
  label: string;
  onSelect: () => void;
  onEdit: () => void;
  onUp: () => void;
  onDown: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  statusAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 text-sm select-none transition-colors ${
        active
          ? 'border-accent bg-accent-soft/50 ring-1 ring-accent text-accent-ink shadow-sm'
          : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div
          className={`cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink p-1 touch-none select-none ${
            disabled ? 'cursor-not-allowed opacity-40' : ''
          }`}
          title="Drag to reorder"
          aria-hidden="true"
        >
          <GripVerticalIcon className="h-4 w-4 shrink-0" />
        </div>
        {badge}
      </div>
      <button
        type="button"
        className="w-full text-left font-medium text-ink hover:text-accent transition-colors truncate"
        onClick={onSelect}
      >
        {label}
      </button>
      <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2">
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={disabled}>
          Edit
        </Button>
        <div className="flex items-center gap-1.5">
          {statusAction && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${statusAction.label} ${label}`}
              onClick={statusAction.onClick}
              loading={statusAction.loading}
              disabled={statusAction.disabled || disabled}
            >
              {statusAction.label}
            </Button>
          )}
          <Button
            aria-label={`Move ${label} up`}
            size="sm"
            variant="ghost"
            onClick={onUp}
            disabled={disabled}
            title="Move item up"
          >
            ↑
          </Button>
          <Button
            aria-label={`Move ${label} down`}
            size="sm"
            variant="ghost"
            onClick={onDown}
            disabled={disabled}
            title="Move item down"
          >
            ↓
          </Button>
        </div>
      </div>
    </div>
  );
}

function LessonDialog({
  draft,
  lessons,
  editingId,
  onChange,
  onClose,
  onSave,
  loading,
}: {
  draft: LessonDraft | null;
  lessons: Lesson[];
  editingId: string | null;
  onChange: (x: LessonDraft) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      title={editingId ? 'Edit lesson' : 'Create lesson'}
      description="Configure lesson title, summary, and prerequisite constraints."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={loading}>
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-ink">
            Lesson title
            <input
              aria-label="Lesson title"
              required
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="e.g. Robot Kinematics Overview"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Summary
            <textarea
              aria-label="Lesson summary"
              value={draft.summary}
              onChange={(e) => onChange({ ...draft, summary: e.target.value })}
              className="mt-1.5 min-h-24 w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Brief summary of the lesson concepts and goals..."
            />
          </label>
          <fieldset className="rounded-lg border border-line p-3 bg-sunken/20">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Prerequisites
            </legend>
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
              {lessons.filter((x) => x.id !== editingId).length === 0 ? (
                <p className="text-xs text-ink-muted">No other lessons available to set as prerequisite.</p>
              ) : (
                lessons
                  .filter((x) => x.id !== editingId)
                  .map((x) => (
                    <label key={x.id} className="flex items-center gap-2 text-sm text-ink hover:text-accent cursor-pointer">
                      <input
                        aria-label={`Require ${x.title}`}
                        type="checkbox"
                        checked={draft.prerequisiteLessonIds.includes(x.id)}
                        onChange={(e) =>
                          onChange({
                            ...draft,
                            prerequisiteLessonIds: e.target.checked
                              ? [...draft.prerequisiteLessonIds, x.id]
                              : draft.prerequisiteLessonIds.filter((id) => id !== x.id),
                          })
                        }
                        className="rounded border-line-strong text-accent focus:ring-accent"
                      />
                      {x.title}
                    </label>
                  ))
              )}
            </div>
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}

function SectionDialog({
  draft,
  editing,
  onChange,
  onClose,
  onSave,
  loading,
}: {
  draft: SectionDraft | null;
  editing: boolean;
  onChange: (x: SectionDraft) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      title={editing ? 'Edit section' : 'Create section'}
      description="Sections organize activities within a lesson."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={loading}>
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <label className="block text-sm font-medium text-ink">
          Section title
          <input
            aria-label="Section title"
            required
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="e.g. Conceptual Foundation"
          />
        </label>
      )}
    </Dialog>
  );
}

function ActivityDialog({
  draft,
  editing,
  onChange,
  onClose,
  onSave,
  loading,
}: {
  draft: ActivityDraft | null;
  editing: boolean;
  onChange: (x: ActivityDraft) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  const ref = draft?.contentRef;
  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      title={editing ? 'Edit activity' : 'Create activity'}
      description="Activities are discrete learning steps (reading, practice, lab, quiz)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={loading}>
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-ink">
            Activity title
            <input
              aria-label="Activity title"
              required
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="e.g. Forward Kinematics Simulation"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Activity type
              <select
                aria-label="Activity type"
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value;
                  onChange({ ...draft, type, contentRef: defaultRef(type) });
                }}
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                {types.map((x) => (
                  <option key={x} value={x}>
                    {x.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  aria-label="Required"
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => onChange({ ...draft, required: e.target.checked })}
                  className="rounded border-line-strong text-accent focus:ring-accent"
                />
                Required activity
              </label>
            </div>
          </div>

          <label className="block text-sm font-medium text-ink">
            Content reference kind
            <select
              aria-label="Content reference kind"
              value={ref?.kind}
              onChange={(e) => {
                const kind = e.target.value as ContentRef['kind'];
                onChange({
                  ...draft,
                  contentRef:
                    kind === 'lesson_content'
                      ? { kind, key: 'summary' }
                      : kind === 'assignment'
                      ? { kind, id: '' }
                      : { kind },
                });
              }}
              className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="lesson_content">Lesson content</option>
              <option value="assignment">Assignment</option>
              <option value="none">No reference</option>
            </select>
          </label>

          {ref?.kind === 'lesson_content' && (
            <label className="block text-sm font-medium text-ink">
              Lesson content key
              <input
                aria-label="Lesson content key"
                value={ref.key}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    contentRef: { kind: 'lesson_content', key: e.target.value },
                  })
                }
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="summary"
              />
            </label>
          )}

          {ref?.kind === 'assignment' && (
            <label className="block text-sm font-medium text-ink">
              Assignment ID
              <input
                aria-label="Assignment ID"
                value={ref.id}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    contentRef: { kind: 'assignment', id: e.target.value },
                  })
                }
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="UUID or assignment identifier"
              />
            </label>
          )}
        </div>
      )}
    </Dialog>
  );
}
