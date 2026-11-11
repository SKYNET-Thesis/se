import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, EyeIcon, LockIcon, MenuIcon, RocketIcon } from 'lucide-react';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { NavDrawer } from '../../components/layout/NavDrawer';
import { MediaAssetLibraryModal } from '../../components/authoring/MediaAssetLibraryModal';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { catalogApi, type ApiCourse } from '../../lib/api';
import { CanonicalCurriculumEditor, type CurriculumEditorActions } from './CanonicalCurriculumEditor';

export type CourseBuilderTab = 'details' | 'curriculum' | 'media' | 'settings';
const TABS: CourseBuilderTab[] = ['details', 'curriculum', 'media', 'settings'];
const TITLE_MAX = 200; // CreateCourseDto / UpdateCourseDto
const DESCRIPTION_MAX = 4000;
const COURSES_HOME = '/admin/courses';

const STATUS_TONE: Record<string, BadgeTone> = { published: 'ok', draft: 'warn', archived: 'neutral' };
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
/** Nested under ['admin','courses'] so invalidating the course list (publish, archive, save) also refreshes the builder. */
const courseDetailKey = (courseId: string) => ['admin', 'courses', 'detail', courseId] as const;

const inputClass =
  'mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

/**
 * Full-page Course Builder. One workspace for creating and editing a course:
 * `/admin/courses/new` starts an unsaved draft form; `/admin/courses/:id?tab=…` opens an existing course.
 * Creating the draft only changes the route param, so this component (and everything mounted in it) stays alive.
 */
export function CourseBuilder() {
  const { courseId = 'new' } = useParams<{ courseId: string }>();
  const isNew = courseId === 'new';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';

  const courseQuery = useQuery({
    queryKey: courseDetailKey(courseId),
    queryFn: () => catalogApi.course(courseId, token),
    enabled: !isNew && Boolean(token),
  });
  const course: ApiCourse | undefined = isNew ? undefined : courseQuery.data;
  const isArchived = course?.status === 'archived';

  // ---- Course Details form (local until saved) ----
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const loadedRef = useRef<{ id: string; title: string; description: string } | null>(null);
  const detailsDirtyRef = useRef(false);
  useEffect(() => {
    // Load server values when a course appears (or changes) and refresh them while untouched; never overwrite typing.
    if (!course) return;
    const previous = loadedRef.current;
    loadedRef.current = { id: course.id, title: course.title, description: course.description ?? '' };
    const untouched = previous?.id === course.id && title === previous.title && description === previous.description;
    if (previous?.id !== course.id || untouched) {
      setTitle(course.title);
      setDescription(course.description ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const baseTitle = course?.title ?? '';
  const baseDescription = course?.description ?? '';
  const detailsDirty = isNew ? Boolean(title.trim() || description.trim()) : Boolean(course) && (title !== baseTitle || description !== baseDescription);
  detailsDirtyRef.current = detailsDirty;

  const titleError = !title.trim() ? 'Course title is required.' : title.length > TITLE_MAX ? `Keep the title within ${TITLE_MAX} characters.` : null;
  const descriptionError = description.length > DESCRIPTION_MAX ? `Keep the description within ${DESCRIPTION_MAX} characters.` : null;

  const [banner, setBanner] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  // ---- Tabs (URL state) ----
  const requestedTab = searchParams.get('tab');
  const tab: CourseBuilderTab = isNew
    ? 'details' // curriculum, media and settings need a persisted course
    : TABS.includes(requestedTab as CourseBuilderTab)
    ? (requestedTab as CourseBuilderTab)
    : 'curriculum';
  const setTab = useCallback(
    (next: CourseBuilderTab) => {
      if (isNew && next !== 'details') return;
      setBanner(null);
      setSearchParams({ tab: next }, { replace: true });
    },
    [isNew, setSearchParams],
  );
  const [visited, setVisited] = useState<Set<CourseBuilderTab>>(() => new Set([tab]));
  useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  // Success confirmations are transient; errors stay until the next action.
  useEffect(() => {
    if (banner?.tone !== 'ok') return undefined;
    const timer = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  // ---- Dirty / navigation guard ----
  const [curriculumDirty, setCurriculumDirty] = useState(false);
  const dirty = detailsDirty || curriculumDirty;
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const requestLeave = useCallback(
    (href: string): boolean => {
      if (!dirty) return true;
      setPendingLeave(href);
      return false;
    },
    [dirty],
  );
  useEffect(() => {
    if (!detailsDirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [detailsDirty]);

  // ---- Mutations ----
  const creatingRef = useRef(false);
  const create = useMutation({
    mutationFn: (body: { title: string; description?: string }) => catalogApi.createGlobalCourse(token, body),
    onSuccess: async (created) => {
      qc.setQueryData(courseDetailKey(created.id), created);
      await qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setBanner({ tone: 'ok', text: 'Draft created. Add modules, lessons and activities in the Curriculum.' });
      // Same route element, new param: the workspace stays mounted and its state is kept.
      navigate(`${COURSES_HOME}/${created.id}?tab=curriculum`, { replace: true });
    },
    onError: (e) => {
      creatingRef.current = false;
      setBanner({ tone: 'error', text: errorText(e, 'Could not create the draft course.') });
    },
  });
  const save = useMutation({
    mutationFn: (body: { title: string; description: string }) => catalogApi.updateGlobalCourse(courseId, token, body),
    onSuccess: async (updated) => {
      qc.setQueryData(courseDetailKey(updated.id), updated);
      setTitle(updated.title);
      setDescription(updated.description ?? '');
      await qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setBanner({ tone: 'ok', text: 'Course details saved.' });
    },
    onError: (e) => setBanner({ tone: 'error', text: errorText(e, 'Could not save course details.') }),
  });
  const archive = useMutation({
    mutationFn: () => catalogApi.archiveGlobalCourse(courseId, token),
    onSuccess: async (updated) => {
      qc.setQueryData(courseDetailKey(updated.id), updated);
      await qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setBanner({ tone: 'ok', text: 'Course archived.' });
    },
    onError: (e) => setBanner({ tone: 'error', text: errorText(e, 'Could not archive the course.') }),
  });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const submitDetails = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setBanner(null);
    if (titleError || descriptionError) return;
    if (isNew) {
      if (creatingRef.current || create.isPending) return; // create the draft exactly once
      creatingRef.current = true;
      create.mutate({ title: title.trim(), description: description.trim() || undefined });
    } else if (!save.isPending && detailsDirty) {
      save.mutate({ title: title.trim(), description: description.trim() });
    }
  };

  // ---- Preview / Publish (owned by the curriculum editor so there is exactly one flow) ----
  const actionsRef = useRef<CurriculumEditorActions | null>(null);
  const openPreview = () => actionsRef.current?.openPreview();
  const openPublish = () => {
    if (detailsDirty) {
      setTab('details');
      setBanner({ tone: 'error', text: 'You have unsaved course details. Save them before publishing.' });
      return;
    }
    setTab('curriculum'); // publish results are reported in the curriculum view
    actionsRef.current?.openPublish();
  };

  // ---- Header state ----
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeNav = useCallback(() => {
    setNavOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const saveState = useMemo(() => {
    if (create.isPending || save.isPending) return { text: 'Saving…', tone: 'text-ink-muted' };
    if (isNew) return { text: detailsDirty ? 'Not saved yet' : 'Draft not created', tone: 'text-warn-ink' };
    if (dirty) return { text: 'Unsaved changes', tone: 'text-warn-ink' };
    if (banner?.tone === 'error') return { text: 'Save failed', tone: 'text-danger' };
    return { text: 'All changes saved', tone: 'text-ink-muted' };
  }, [banner?.tone, create.isPending, dirty, detailsDirty, isNew, save.isPending]);

  const headerTitle = (course?.title ?? title.trim()) || 'Untitled Course';
  const status = course?.status ?? 'draft';
  const locked = isNew;
  const publishLabel = status === 'draft' || isNew ? 'Review & Publish' : 'Readiness Checklist';
  const tabItems: Array<TabItem<CourseBuilderTab>> = [
    { id: 'details', label: 'Course Details' },
    { id: 'curriculum', label: 'Curriculum' },
    { id: 'media', label: 'Media Library' },
    { id: 'settings', label: 'Settings' },
  ];

  // ---- Existing course: loading / failure ----
  if (!isNew && courseQuery.isLoading) {
    return (
      <div className="grid h-dvh place-items-center bg-canvas text-sm text-ink-muted" role="status">
        Loading course…
      </div>
    );
  }
  if (!isNew && !course) {
    return (
      <div className="grid h-dvh place-items-center bg-canvas p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold text-ink">Course unavailable</h1>
          <p role="alert" className="text-sm text-ink-muted">
            {courseQuery.isError ? errorText(courseQuery.error, 'The course could not be loaded.') : 'The course could not be found.'}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => void courseQuery.refetch()}>Try again</Button>
            <Link to={COURSES_HOME} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">
              Back to Course Management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-canvas text-ink" data-testid="course-builder">
      <a href="#builder-main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to editor
      </a>

      {/* Top header */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-4">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setNavOpen(true)}
          className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink"
          aria-label="Open navigation"
          aria-expanded={navOpen}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden shrink-0 font-semibold sm:inline">VISTA / Course Builder</span>
          <ChevronRightIcon className="hidden h-3.5 w-3.5 shrink-0 text-ink-subtle md:block" aria-hidden />
          <span className="min-w-0 truncate font-medium text-ink-muted sm:max-w-[28ch] lg:max-w-[48ch]" title={headerTitle} data-testid="header-title">{headerTitle}</span>
        </div>
        <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className="capitalize">{isNew ? 'New draft' : status === 'published' ? 'Published' : status === 'draft' ? 'Draft' : status}</Badge>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span role="status" aria-live="polite" className={`hidden text-xs sm:inline ${saveState.tone}`} data-testid="save-status">{saveState.text}</span>
          <Button size="sm" variant="secondary" aria-label="Preview" icon={<EyeIcon className="h-4 w-4" />} disabled={isNew} title={isNew ? 'Create the draft first' : 'View as Learner'} onClick={openPreview}>
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<RocketIcon className="h-4 w-4" />}
            aria-label={publishLabel}
            disabled={isNew || isArchived}
            title={isNew ? 'Create the draft first' : undefined}
            onClick={openPublish}
          >
            <span className="hidden sm:inline">{publishLabel}</span>
          </Button>
        </div>
      </header>

      {/* Scrollable workspace body (the page's only vertical scroll area) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-3 pb-8 pt-3 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
            <Link
              to={COURSES_HOME}
              onClick={(e) => { if (!requestLeave(COURSES_HOME)) e.preventDefault(); }}
              className="rounded hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Course Management
            </Link>
            <ChevronRightIcon className="h-3 w-3" aria-hidden />
            <span aria-current="page">{isNew ? 'Create Course' : 'Edit Course'}</span>
          </nav>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{headerTitle}</h1>
              <p className="text-xs text-ink-muted">
                Course workspace · {isNew ? 'Not saved yet' : status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft'}
              </p>
            </div>
            <Link
              to={COURSES_HOME}
              onClick={(e) => { if (!requestLeave(COURSES_HOME)) e.preventDefault(); }}
              className="rounded text-xs font-medium text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ← Back to Course Management
            </Link>
          </div>

          <Tabs className="mt-3 overflow-x-auto whitespace-nowrap" items={tabItems} value={tab} onChange={setTab} label="Course Builder sections" />
          {locked && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
              <LockIcon className="h-3.5 w-3.5" aria-hidden /> Create the draft to unlock Curriculum, Media Library and Settings.
            </p>
          )}

          {banner && (
            <p
              role={banner.tone === 'error' ? 'alert' : 'status'}
              className={`mt-4 rounded-lg border p-3 text-sm ${banner.tone === 'error' ? 'border-danger/20 bg-danger-soft text-danger' : 'border-accent/20 bg-accent-soft text-ink'}`}
            >
              {banner.text}
            </p>
          )}

          <main id="builder-main" tabIndex={-1} className="mt-5 outline-none">
            {/* Course Details */}
            <div role="tabpanel" aria-label="Course Details" hidden={tab !== 'details'}>
              <form onSubmit={submitDetails} noValidate className="max-w-3xl space-y-5 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6" aria-label="Course details">
                <div>
                  <h3 className="text-lg font-bold">Course details</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {isNew ? 'Name your course to create a draft. You will add its curriculum next.' : 'The title and overview learners see in the catalog.'}
                  </p>
                </div>
                <label className="block text-sm font-medium">
                  Course Title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isArchived || create.isPending}
                    placeholder="e.g. Dual-Arm Robotics Manipulation"
                    aria-invalid={submitted && titleError ? true : undefined}
                    aria-describedby={submitted && titleError ? 'course-title-error' : undefined}
                    className={`${inputClass} h-10`}
                  />
                  {submitted && titleError && <span id="course-title-error" role="alert" className="mt-1 block text-xs text-danger">{titleError}</span>}
                </label>
                <label className="block text-sm font-medium">
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isArchived || create.isPending}
                    rows={5}
                    placeholder="Describe the learning objectives and the skills covered in this course…"
                    aria-invalid={descriptionError ? true : undefined}
                    className={`${inputClass} p-3`}
                  />
                  <span className="mt-1 flex justify-between text-xs">
                    <span role={descriptionError ? 'alert' : undefined} className="text-danger">{descriptionError}</span>
                    <span className="text-ink-subtle">{description.length}/{DESCRIPTION_MAX}</span>
                  </span>
                </label>

                {course && (course.label || course.level || course.recommendedGrades || course.learningOutcome || (course.competencies?.length ?? 0) > 0) && (
                  <dl className="grid gap-3 rounded-lg border border-line bg-sunken/30 p-4 text-sm sm:grid-cols-2" aria-label="Course metadata">
                    {course.label && <Meta term="Label" value={course.label} />}
                    {course.level && <Meta term="Level" value={course.level} />}
                    {course.recommendedGrades && <Meta term="Recommended grades" value={course.recommendedGrades} />}
                    {course.learningOutcome && <Meta term="Learning outcome" value={course.learningOutcome} wide />}
                    {(course.competencies?.length ?? 0) > 0 && <Meta term="Competencies" value={(course.competencies ?? []).map((c) => c.title).join(', ')} wide />}
                  </dl>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <span role="status" className={`text-xs ${saveState.tone}`}>{saveState.text}</span>
                  <Button type="submit" variant="primary" loading={create.isPending || save.isPending} disabled={isArchived || create.isPending || save.isPending || (!isNew && !detailsDirty)}>
                    {isNew ? 'Create Draft' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Curriculum: stays mounted while other tabs are open so selection and unsaved edits survive tab switches */}
            {course && (
              <div role="tabpanel" aria-label="Curriculum" hidden={tab !== 'curriculum'}>
                <CanonicalCurriculumEditor
                  key={course.id}
                  embedded
                  course={course}
                  token={token}
                  isArchived={isArchived}
                  onDirtyChange={setCurriculumDirty}
                  actionsRef={actionsRef}
                />
              </div>
            )}

            {/* Media Library */}
            {course && visited.has('media') && (
              <div role="tabpanel" aria-label="Media Library" hidden={tab !== 'media'}>
                <MediaAssetLibraryModal inline open onClose={() => setTab('curriculum')} courseId={course.id} token={token} />
              </div>
            )}

            {/* Settings: only what the backend supports (lifecycle state and archiving) */}
            {course && (
              <div role="tabpanel" aria-label="Settings" hidden={tab !== 'settings'}>
                <section className="max-w-3xl space-y-5 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6" aria-label="Course settings">
                  <div>
                    <h3 className="text-lg font-bold">Settings</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">Lifecycle controls for this course.</p>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Meta term="Status" value={status} />
                    <Meta term="Course ID" value={course.id} mono />
                  </dl>
                  <p className="text-xs text-ink-muted">
                    Publishing goes through Review &amp; Publish in the header, which applies the server&apos;s readiness rules.
                  </p>
                  <div className="rounded-lg border border-danger/30 p-4">
                    <h4 className="text-sm font-semibold text-danger">Archive course</h4>
                    <p className="mt-1 text-xs text-ink-muted">Archived courses are frozen against curriculum changes and leave the catalog.</p>
                    <Button className="mt-3" size="sm" variant="danger" disabled={isArchived || archive.isPending} loading={archive.isPending} onClick={() => setArchiveOpen(true)}>
                      {isArchived ? 'Course is archived' : 'Archive course'}
                    </Button>
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      <NavDrawer open={navOpen} onClose={closeNav} onNavigateRequest={(href) => requestLeave(href)} />

      <ConfirmDialog
        open={archiveOpen}
        title="Archive this course?"
        description="Archived courses are frozen against curriculum changes and removed from the catalog."
        confirmLabel="Archive course"
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => { setArchiveOpen(false); archive.mutate(); }}
      />
      <ConfirmDialog
        open={pendingLeave !== null}
        title="Leave without saving?"
        description="You have unsaved changes in this course. If you leave now they will be lost."
        confirmLabel="Discard and leave"
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const target = pendingLeave;
          setPendingLeave(null);
          setCurriculumDirty(false);
          detailsDirtyRef.current = false;
          if (target) navigate(target);
        }}
      />
    </div>
  );
}

function Meta({ term, value, wide, mono }: { term: string; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{term}</dt>
      <dd className={`mt-0.5 break-words text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
