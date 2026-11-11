import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  EyeIcon,
  FolderOpenIcon,
  InfoIcon,
  RocketIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { catalogApi, curriculumApi, type ApiCourse, type ApiRecord } from '../../lib/api';
import { AddContentMenu } from '../../components/authoring/AddContentMenu';
import { ActivityEditorPanel } from '../../components/authoring/ActivityEditorPanel';
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
  content?: Record<string, unknown>;
};

type LessonDraft = { title: string; summary: string; prerequisiteLessonIds: string[] };
type SectionDraft = { title: string };
type ActivityDraft = { title: string; type: string; required: boolean; contentRef: ContentRef; content: Record<string, unknown> };
type LessonTab = 'overview' | 'content' | 'settings';
const EMPTY_LESSON_DRAFT: LessonDraft = { title: '', summary: '', prerequisiteLessonIds: [] };

const lessonDraftFrom = (lesson: Lesson): LessonDraft => ({
  title: lesson.title,
  summary: typeof lesson.content?.summary === 'string' ? lesson.content.summary : '',
  prerequisiteLessonIds: lesson.prerequisiteLessonIds ?? [],
});

const sameLessonDraft = (left: LessonDraft, right: LessonDraft) =>
  left.title === right.title && left.summary === right.summary &&
  [...left.prerequisiteLessonIds].sort().join(',') === [...right.prerequisiteLessonIds].sort().join(',');

const assignmentTypes = new Set(['guided_practice', 'knowledge_check', 'simulation', 'challenge', 'physical_lab']);

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Could not save curriculum changes.');

const defaultRef = (type: string): ContentRef =>
  assignmentTypes.has(type) ? { kind: 'assignment', id: '' } : { kind: 'lesson_content', key: 'summary' };

const defaultActivityContent = (type: string): Record<string, unknown> =>
  type === 'reading' ? { version: 1, blocks: [], mediaIds: [] }
    : type === 'video' ? { version: 1, videoMediaId: '', description: '' }
    : ['demonstration', 'guided_practice', 'simulation', 'challenge', 'physical_lab', 'result', 'reflection'].includes(type)
      ? { version: 1, instructions: '', learningOutcome: '', estimatedMinutes: 15 }
      : {};



export function CanonicalCurriculumEditor({
  course,
  token,
  onDirtyChange,
  modalRequest,
}: {
  course: ApiCourse;
  token: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** Lets the Course Builder tabs open the existing learner preview / readiness modals. */
  modalRequest?: { kind: 'preview' | 'readiness'; nonce: number } | null;
}) {
  const qc = useQueryClient();
  const [lessonId, setLessonId] = useState<string>();
  const [lessonEditingId, setLessonEditingId] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string>();
  const [lessonTab, setLessonTab] = useState<LessonTab>('overview');
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [sectionId, setSectionId] = useState<string>();
  const [activeActivityId, setActiveActivityId] = useState<string>();

  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [editId, setEditId] = useState<{ kind: 'section' | 'activity'; id: string } | null>(null);
  const lessonTitleRef = useRef<HTMLInputElement>(null);
  const lessonSubmitLockRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Authoring Studio Modals
  const [learnerPreviewOpen, setLearnerPreviewOpen] = useState(false);
  const [readinessChecklistOpen, setReadinessChecklistOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  useEffect(() => {
    if (!modalRequest) return;
    if (modalRequest.kind === 'preview') setLearnerPreviewOpen(true);
    else setReadinessChecklistOpen(true);
  }, [modalRequest]);

  // Optimistic order state while accessible move actions are persisted.
  const [reorderedLessons, setReorderedLessons] = useState<Lesson[] | null>(null);
  const [reorderedSections, setReorderedSections] = useState<Section[] | null>(null);
  const [reorderedActivities, setReorderedActivities] = useState<Activity[] | null>(null);

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

  const lessonBaseline = lessonEditingId ? lessonList.find((item) => item.id === lessonEditingId) : undefined;
  const lessonDraftDirty = Boolean(lessonDraft && !sameLessonDraft(lessonDraft, lessonBaseline ? lessonDraftFrom(lessonBaseline) : EMPTY_LESSON_DRAFT));
  const sectionBaseline = editId?.kind === 'section' ? sectionList.find((item) => item.id === editId.id) : undefined;
  const sectionDraftDirty = Boolean(sectionDraft && (sectionBaseline ? sectionBaseline.title !== sectionDraft.title : sectionDraft.title.trim()));
  const activityBaseline = editId?.kind === 'activity' ? activityList.find((item) => item.id === editId.id) : undefined;
  const activityDraftDirty = Boolean(activityDraft && (activityBaseline
    ? activityBaseline.title !== activityDraft.title || activityBaseline.type !== activityDraft.type || activityBaseline.required !== activityDraft.required || JSON.stringify(activityBaseline.content_ref) !== JSON.stringify(activityDraft.contentRef) || JSON.stringify(activityBaseline.content ?? {}) !== JSON.stringify(activityDraft.content)
    : activityDraft.title.trim() !== '' || activityDraft.required !== true || JSON.stringify(activityDraft.content) !== JSON.stringify(defaultActivityContent(activityDraft.type))));
  const dirty = lessonDraftDirty || sectionDraftDirty || activityDraftDirty;
  const lessonFocusKey = lessonDraft ? lessonEditingId ?? 'new-lesson' : null;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => { if (lessonFocusKey) lessonTitleRef.current?.focus(); }, [lessonFocusKey]);

  useEffect(() => {
    setLessonId(undefined);
    setLessonEditingId(null);
    setExpandedLessonId(undefined);
    setLessonTab('overview');
    setMobileEditorOpen(false);
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
      let prerequisiteError: unknown;
      if (x.prerequisiteLessonIds.length) {
        try {
          await catalogApi.setLessonPrerequisites(created.id, token, x.prerequisiteLessonIds);
        } catch (error) {
          prerequisiteError = error;
        }
      }
      return { created, values: x, prerequisiteError };
    },
    onSuccess: async ({ created, values, prerequisiteError }) => {
      await invalidateLessons();
      const saved = { ...values, title: values.title.trim() };
      setLessonId(created.id);
      setLessonEditingId(created.id);
      setExpandedLessonId(created.id);
      setLessonDraft(saved);
      setLessonTab('overview');
      setSectionId(undefined);
      setMobileEditorOpen(true);
      if (prerequisiteError) {
        setError(`Lesson created, but its prerequisites could not be saved: ${errorMessage(prerequisiteError)}. Save the lesson again to retry.`);
        setNotice(null);
      } else {
        setError(null);
        setNotice('Lesson created.');
      }
    },
    onError: fail,
    onSettled: () => { lessonSubmitLockRef.current = false; },
  });

  const saveLesson = useMutation({
    mutationFn: ({ id, x }: { id: string; x: LessonDraft }) =>
      Promise.all([
        catalogApi.updateLesson(id, token, { title: x.title, content: { summary: x.summary } }),
        catalogApi.setLessonPrerequisites(id, token, x.prerequisiteLessonIds),
      ]),
    onSuccess: async (_, { id, x }) => {
      await invalidateLessons();
      setLessonId(id);
      setLessonDraft(x);
      setError(null);
      setNotice('Lesson saved.');
    },
    onError: fail,
    onSettled: () => { lessonSubmitLockRef.current = false; },
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
        ...(Object.keys(x.content ?? {}).length ? { content: x.content } : {}),
      }),
    onSuccess: async (saved) => {
      await invalidateSections();
      setActiveActivityId(saved.id as string);
      setActivityDraft(null);
      setEditId(null);
      setError(null);
      setNotice('Activity saved as draft.');
    },
    onError: fail,
  });

  const saveActivity = useMutation({
    mutationFn: ({ id, x }: { id: string; x: Partial<ActivityDraft> }) =>
      curriculumApi.updateActivity(id, token, {
        title: x.title,
        type: x.type,
        required: x.required,
        contentRef: x.contentRef,
        ...(Object.keys(x.content ?? {}).length ? { content: x.content } : {}),
      }),
    onSuccess: async (_saved, { id }) => {
      await invalidateSections();
      setActiveActivityId(id);
      setActivityDraft(null);
      setEditId(null);
      setError(null);
      setNotice('Activity draft saved.');
    },
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
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
  };

  const cancelActivity = () => {
    if (activityDraftDirty && !window.confirm('Discard unsaved activity changes?')) return;
    setActivityDraft(null);
    setEditId(null);
  };

  const confirmDiscardLessonChanges = () =>
    !dirty || window.confirm('Discard unsaved lesson or content changes?');

  const openLesson = (item: Lesson) => {
    if (lessonId === item.id && lessonEditingId === item.id) {
      setLessonTab('overview');
      setExpandedLessonId(item.id);
      setMobileEditorOpen(true);
      return;
    }
    if (!confirmDiscardLessonChanges()) return;
    setLessonId(item.id);
    setLessonEditingId(item.id);
    setExpandedLessonId(item.id);
    setLessonDraft(lessonDraftFrom(item));
    setLessonTab('overview');
    setMobileEditorOpen(true);
    setSectionId(undefined);
    setActiveActivityId(undefined);
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
    setReorderedSections(null);
    setReorderedActivities(null);
  };

  const startNewLesson = () => {
    if (!confirmDiscardLessonChanges()) return;
    setLessonId(undefined);
    setLessonEditingId(null);
    setExpandedLessonId(undefined);
    setLessonDraft({ ...EMPTY_LESSON_DRAFT });
    setLessonTab('overview');
    setMobileEditorOpen(true);
    setSectionId(undefined);
    setActiveActivityId(undefined);
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
  };

  const cancelLesson = () => {
    if (!confirmDiscardLessonChanges()) return;
    setSectionDraft(null);
    setActivityDraft(null);
    setEditId(null);
    setActiveActivityId(undefined);
    setSectionId(undefined);
    setLessonTab('overview');
    if (lessonEditingId) {
      const persisted = lessonList.find((item) => item.id === lessonEditingId);
      if (persisted) setLessonDraft(lessonDraftFrom(persisted));
    } else {
      setLessonDraft(null);
      setMobileEditorOpen(false);
    }
  };

  const submitLesson = () => {
    if (!lessonDraft?.title.trim() || lessonSubmitLockRef.current) return;
    lessonSubmitLockRef.current = true;
    const x = { ...lessonDraft, title: lessonDraft.title.trim() };
    if (lessonEditingId) saveLesson.mutate({ id: lessonEditingId, x });
    else addLesson.mutate(x);
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
    if (assignmentTypes.has(activityDraft.type) && (activityDraft.contentRef.kind !== 'assignment' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityDraft.contentRef.id))) {
      setError('This activity type requires an existing assignment UUID.');
      return;
    }
    const x = { ...activityDraft, title: activityDraft.title.trim() };
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
          Authoring structure: Course → learner-tracked unit → section → learning activity.
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

      {/* Two-column authoring workspace: existing lessons remain visible beside the selected editor. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.55fr)]" aria-label="Lesson authoring workspace">
        <section className={`${mobileEditorOpen ? 'hidden lg:block' : 'block'} min-w-0 overflow-hidden rounded-xl border border-line bg-surface`} aria-label="Course outline">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-sunken/30 px-4 py-3">
            <div><h3 className="font-semibold text-ink">Course outline</h3><p className="mt-0.5 text-xs text-ink-muted">{lessonList.length} lessons</p></div>
          </header>
          {lessonList.length === 0 ? <p className="px-4 py-7 text-center text-sm text-ink-muted">No lessons yet.</p> : <div className="divide-y divide-line">
            {lessonList.map((item, index) => {
              const expanded = expandedLessonId === item.id;
              const selected = lessonId === item.id;
              return <article key={item.id} className="min-w-0">
                <div className={`flex items-center gap-1 px-2 py-2 ${selected ? 'bg-accent-soft/50' : ''}`}>
                  <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 px-1" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.title}`} aria-expanded={expanded} onClick={() => {
                    if (expanded) setExpandedLessonId(undefined);
                    else { openLesson(item); setExpandedLessonId(item.id); }
                  }}><ChevronRightIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} /></Button>
                  <button type="button" aria-current={selected ? 'true' : undefined} className={`min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected ? 'text-accent-ink' : 'text-ink hover:text-accent-ink'}`} onClick={() => openLesson(item)}>{item.title}</button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${item.title} up`} disabled={isArchived || index === 0} onClick={() => moveLesson(index, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${item.title} down`} disabled={isArchived || index === lessonList.length - 1} onClick={() => moveLesson(index, 1)}>↓</Button>
                </div>
                {expanded && selected && <div className="space-y-1 border-t border-line bg-sunken/20 py-2 pl-11 pr-3">
                  {sectionList.length === 0 ? <p className="py-1 text-xs text-ink-muted">No sections</p> : sectionList.map((sec) => <div key={sec.id}>
                    <button type="button" aria-expanded={sectionId === sec.id} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface hover:text-ink" onClick={() => { setSectionId(sectionId === sec.id ? undefined : sec.id); setLessonTab('content'); setActiveActivityId(undefined); }}><span className="min-w-0 truncate">{sec.title}</span><span className="shrink-0">{(sec.learning_activities ?? []).length} activities</span></button>
                    {sectionId === sec.id && <div className="ml-3 border-l border-line pl-2">{(sec.learning_activities ?? []).map((activity) => <button key={activity.id} type="button" className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${activeActivityId === activity.id ? 'font-medium text-accent-ink' : 'text-ink-muted hover:text-ink'}`} onClick={() => { setActiveActivityId(activity.id); setLessonTab('content'); }}>{activity.title}</button>)}</div>}
                  </div>)}
                </div>}
              </article>;
            })}
          </div>}
          <footer className="border-t border-line p-3"><Button className="w-full" variant="secondary" disabled={isArchived} onClick={startNewLesson}>+ Add Lesson</Button></footer>
        </section>

        <section className={`${mobileEditorOpen ? 'block' : 'hidden lg:block'} min-w-0 rounded-xl border border-line bg-surface`} aria-label="Lesson editor panel">
          {lessonDraft ? <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0"><p className="text-xs text-ink-muted">{lessonEditingId ? 'Course outline / Lesson' : 'Course outline / New lesson'}</p><h3 className="truncate font-semibold text-ink">{lessonDraft.title || (lessonEditingId ? 'Untitled lesson' : 'New lesson')}</h3></div>
              <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setMobileEditorOpen(false)}>Back to outline</Button>
            </header>
            <div role="tablist" aria-label="Lesson editor sections" className="flex gap-1 border-b border-line px-3">
              {([['overview', 'Overview'], ['content', 'Learning Content'], ['settings', 'Settings']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={lessonTab === id} disabled={id === 'content' && !lessonEditingId} onClick={() => setLessonTab(id)} className={`min-h-11 border-b-2 px-3 text-sm font-medium ${lessonTab === id ? 'border-accent text-accent-ink' : 'border-transparent text-ink-muted hover:text-ink'} disabled:cursor-not-allowed disabled:opacity-40`}>{label}</button>)}
            </div>
            <div className="p-4 sm:p-5">
              {lessonTab === 'overview' && <div className="mx-auto max-w-2xl space-y-4">
                <label className="block text-sm font-medium text-ink">Lesson title <span className="text-danger">*</span><input ref={lessonTitleRef} aria-label="Lesson title" autoFocus required value={lessonDraft.title} onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="e.g. Robot Kinematics Overview" /></label>
                <label className="block text-sm font-medium text-ink">Summary <span className="font-normal text-ink-muted">(optional)</span><textarea aria-label="Lesson summary" value={lessonDraft.summary} onChange={(event) => setLessonDraft({ ...lessonDraft, summary: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-md border border-line-strong bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="Briefly describe the lesson concepts and goals." /></label>
                <fieldset className="rounded-lg border border-line p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Prerequisites</legend>{lessonList.filter((item) => item.id !== lessonEditingId).length === 0 ? <p className="text-xs text-ink-muted">No other lessons available.</p> : <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{lessonList.filter((item) => item.id !== lessonEditingId).map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input aria-label={`Require ${item.title}`} type="checkbox" checked={lessonDraft.prerequisiteLessonIds.includes(item.id)} onChange={(event) => setLessonDraft({ ...lessonDraft, prerequisiteLessonIds: event.target.checked ? [...lessonDraft.prerequisiteLessonIds, item.id] : lessonDraft.prerequisiteLessonIds.filter((id) => id !== item.id) })} />{item.title}</label>)}</div>}</fieldset>
                {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
                <div className="flex justify-end gap-2 border-t border-line pt-4"><Button variant="secondary" onClick={cancelLesson}>Cancel</Button><Button variant="primary" disabled={!lessonDraft.title.trim() || isArchived || lessonSubmitLockRef.current} loading={addLesson.isPending || saveLesson.isPending} onClick={submitLesson}>{lessonEditingId ? 'Save Lesson' : 'Create Lesson'}</Button></div>
              </div>}
              {lessonTab === 'settings' && <p className="mx-auto max-w-2xl rounded-lg bg-sunken/30 p-4 text-sm text-ink-muted">No additional lesson settings are exposed by the current course API.</p>}
              {lessonTab === 'content' && lessonEditingId && <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold text-ink">Sections and activities</h4><p className="mt-1 text-xs text-ink-muted">Activities are saved inside their existing course sections.</p></div><Button size="sm" variant="secondary" disabled={isArchived} onClick={() => { setEditId(null); setSectionDraft({ title: '' }); }}>+ Add Section</Button></div>
                {sectionDraft && editId?.kind !== 'section' && <InlineSectionForm draft={sectionDraft} onChange={setSectionDraft} onCancel={cancel} onSave={submitSection} loading={addSection.isPending} />}
                {sectionList.length === 0 ? <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-muted">No sections yet. Add a section to start organizing lesson content.</p> : <div className="space-y-3">
                  {sectionList.map((sec, sectionIndex) => {
                    const sectionExpanded = sectionId === sec.id;
                    const editingSection = editId?.kind === 'section' && editId.id === sec.id;
                    return <article key={sec.id} className="overflow-hidden rounded-lg border border-line">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2"><Button variant="ghost" className="min-w-0 flex-1 justify-start px-1 text-left" aria-expanded={sectionExpanded} onClick={() => { setSectionId(sectionExpanded ? undefined : sec.id); setActiveActivityId(undefined); setReorderedActivities(null); }}><ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${sectionExpanded ? 'rotate-90' : ''}`} /><span className="truncate font-medium">{sec.title}</span><Badge tone={sec.status === 'published' ? 'ok' : 'neutral'} dot>{sec.status ?? 'draft'}</Badge></Button><Button size="sm" variant="ghost" aria-label={`Move ${sec.title} up`} disabled={isArchived || sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move ${sec.title} down`} disabled={isArchived || sectionIndex === sectionList.length - 1} onClick={() => moveSection(sectionIndex, 1)}>↓</Button><Button size="sm" variant="secondary" disabled={isArchived} onClick={() => { setEditId({ kind: 'section', id: sec.id }); setSectionDraft({ title: sec.title }); }}>Edit</Button><Button size="sm" variant="ghost" aria-label={`${sec.status === 'published' ? 'Unpublish' : 'Publish'} ${sec.title}`} disabled={isArchived || toggleSectionStatus.isPending} onClick={() => toggleSectionStatus.mutate({ id: sec.id, status: sec.status === 'published' ? 'draft' : 'published' })}>{sec.status === 'published' ? 'Unpublish' : 'Publish'}</Button></div>
                      {editingSection && sectionDraft && <InlineSectionForm draft={sectionDraft} onChange={setSectionDraft} onCancel={cancel} onSave={submitSection} loading={saveSection.isPending} />}
                      {sectionExpanded && <div className="space-y-2 border-t border-line bg-sunken/20 p-3"><h5 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Learning activities <span className="font-normal">({(sec.learning_activities ?? []).length})</span></h5>
                        {(sec.learning_activities ?? []).map((activity, activityIndex) => <div key={activity.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${activeActivityId === activity.id ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface'}`}><button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-accent-ink" onClick={() => { if (!confirmDiscardLessonChanges()) return; setActiveActivityId(activity.id); setActivityDraft(null); setEditId(null); setLessonTab('content'); }}>{activity.title}<span className="ml-2 text-xs font-normal capitalize text-ink-muted">{activity.type.replace('_', ' ')}</span></button><Badge tone={activity.status === 'published' ? 'ok' : 'neutral'} dot>{activity.status ?? 'draft'}</Badge><Button size="sm" variant="ghost" aria-label={`Move ${activity.title} up`} disabled={isArchived || activityIndex === 0} onClick={() => moveActivity(activityIndex, -1)}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move ${activity.title} down`} disabled={isArchived || activityIndex === (sec.learning_activities ?? []).length - 1} onClick={() => moveActivity(activityIndex, 1)}>↓</Button><Button size="sm" variant="ghost" aria-label={`${activity.status === 'published' ? 'Unpublish' : 'Publish'} ${activity.title}`} disabled={isArchived || toggleActivityStatus.isPending} onClick={() => toggleActivityStatus.mutate({ id: activity.id, status: activity.status === 'published' ? 'draft' : 'published' })}>{activity.status === 'published' ? 'Unpublish' : 'Publish'}</Button></div>)}
                        {(sec.learning_activities ?? []).length === 0 && <p className="text-sm text-ink-muted">No activities in this section yet.</p>}
                <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3"><AddContentMenu disabled={isArchived} onSelectType={(type) => { if (!confirmDiscardLessonChanges()) return; setSectionId(sec.id); setActiveActivityId(undefined); setEditId(null); setError(null); setActivityDraft({ title: '', type, required: true, contentRef: defaultRef(type), content: defaultActivityContent(type) }); }} /><Button size="sm" variant="ghost" disabled={isArchived} onClick={() => { if (!confirmDiscardLessonChanges()) return; setSectionId(sec.id); setActiveActivityId(undefined); setEditId(null); setError(null); setActivityDraft({ title: '', type: 'reading', required: true, contentRef: defaultRef('reading'), content: defaultActivityContent('reading') }); }}>+ Add activity</Button></div>
                      </div>}
                    </article>;
                  })}
                </div>}
                {(activeActivity || activityDraft) && <ActivityEditorPanel courseId={course.id} lessonId={lessonId} token={token} activity={activeActivity} draft={activityDraft} onChange={setActivityDraft} onEdit={() => { if (!confirmDiscardLessonChanges()) return; if (activeActivity) { setEditId({ kind: 'activity', id: activeActivity.id }); setActivityDraft({ title: activeActivity.title, type: activeActivity.type, required: activeActivity.required, contentRef: activeActivity.content_ref ?? defaultRef(activeActivity.type), content: activeActivity.content ?? defaultActivityContent(activeActivity.type) }); } }} onSave={submitActivity} onCancel={cancelActivity} saving={editId?.kind === 'activity' ? saveActivity.isPending : addActivity.isPending} disabled={isArchived} error={error} />}
              </div>}
            </div>
          </> : <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><h3 className="font-semibold text-ink">Select a lesson to begin</h3><p className="mt-1 max-w-sm text-sm text-ink-muted">Choose a lesson from the outline or create a new one to edit its details and learning content.</p><Button className="mt-4 lg:hidden" onClick={() => setMobileEditorOpen(false)}>Back to outline</Button></div>}
        </section>
      </div>

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
        courseId={course.id}
        token={token}
      />
    </section>
  );
}

function InlineFormActions({ onCancel, onSave, loading }: { onCancel: () => void; onSave: () => void; loading: boolean }) {
  return <div className="flex justify-end gap-2 border-t border-line pt-3"><Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button><Button size="sm" variant="primary" onClick={onSave} loading={loading}>Save</Button></div>;
}

function InlineSectionForm({ draft, onChange, onCancel, onSave, loading }: {
  draft: SectionDraft; onChange: (draft: SectionDraft) => void; onCancel: () => void; onSave: () => void; loading: boolean;
}) {
  return <div className="mx-3 mb-3 space-y-3 rounded-md border border-accent/30 bg-surface p-3" aria-label="Section form"><label className="block text-sm font-medium text-ink">Section title<input aria-label="Section title" required value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="e.g. Conceptual Foundation" /></label><InlineFormActions onCancel={onCancel} onSave={onSave} loading={loading} /></div>;
}
