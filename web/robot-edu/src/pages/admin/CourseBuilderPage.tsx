import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, BookOpenIcon, EyeIcon, FileTextIcon, LayersIcon, LibraryIcon, MenuIcon, RocketIcon, SaveIcon } from 'lucide-react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { catalogApi, type ApiCourse } from '../../lib/api';
import { CanonicalCurriculumEditor } from './CanonicalCurriculumEditor';
import { VistaMark } from '../../components/layout/VistaMark';
import { MediaAssetLibraryModal } from '../../components/authoring/MediaAssetLibraryModal';

type BuilderSection = 'information' | 'curriculum' | 'objectives' | 'media' | 'versions' | 'preview' | 'publish';
const sections: { id: BuilderSection; label: string; icon: React.ReactNode }[] = [
  { id: 'information', label: 'Course Information', icon: <FileTextIcon className="h-4 w-4" /> },
  { id: 'curriculum', label: 'Edit Content', icon: <LayersIcon className="h-4 w-4" /> },
  { id: 'objectives', label: 'Learning Objectives', icon: <BookOpenIcon className="h-4 w-4" /> },
  { id: 'media', label: 'Learning Materials', icon: <LibraryIcon className="h-4 w-4" /> },
  { id: 'versions', label: 'Versions', icon: <FileTextIcon className="h-4 w-4" /> },
  { id: 'preview', label: 'Preview', icon: <EyeIcon className="h-4 w-4" /> },
  { id: 'publish', label: 'Publish', icon: <RocketIcon className="h-4 w-4" /> },
];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not save course.';
type BuilderShellContext = { toggleGlobalNavigation: () => void; globalNavigationOpen: boolean; registerNavigationGuard: (guard: () => boolean) => () => void };

export function CourseBuilderPage() {
  const { toggleGlobalNavigation, globalNavigationOpen, registerNavigationGuard } = useOutletContext<BuilderShellContext>();
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !courseId || courseId === 'new';
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requestedSection = searchParams.get('section');
  const [active, setActive] = useState<BuilderSection>(sections.some((section) => section.id === requestedSection) ? requestedSection as BuilderSection : 'information');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [curriculumDirty, setCurriculumDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [modalRequest, setModalRequest] = useState<{ kind: 'preview' | 'readiness'; nonce: number } | null>(null);

  const courseQuery = useQuery({
    queryKey: ['admin', 'courses', 'builder'],
    queryFn: () => catalogApi.courses(token, 1, 100),
    enabled: Boolean(token && !isNew),
  });
  const course = courseQuery.data?.items.find((item) => item.id === courseId);

  useEffect(() => {
    if (!course) return;
    setTitle(course.title);
    setDescription(course.description ?? '');
    setSaveState('saved');
  }, [course]);

  const draft = useMemo(() => ({ title: title.trim(), description: description.trim() }), [title, description]);
  const create = useMutation({
    mutationFn: () => catalogApi.createGlobalCourse(token, { title: draft.title, description: draft.description || undefined }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      await qc.setQueryData(['admin', 'courses', 'builder'], (previous: { items: ApiCourse[]; page: number; pageSize: number } | undefined) => ({ items: [...(previous?.items ?? []), created], page: previous?.page ?? 1, pageSize: previous?.pageSize ?? 100 }));
      navigate(`/admin/courses/${created.id}/edit`, { replace: true });
      setActive('curriculum');
      setSaveState('saved');
      setError(null);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const update = useMutation({
    mutationFn: () => { if (!courseId) throw new Error('Course ID is required to save changes.'); return catalogApi.updateGlobalCourse(courseId, token, { title: draft.title, description: draft.description }); },
    onSuccess: async (updated) => {
      await qc.setQueryData(['admin', 'courses', 'builder'], (previous: { items: ApiCourse[]; page: number; pageSize: number } | undefined) => previous ? { ...previous, items: previous.items.map((item) => item.id === updated.id ? updated : item) } : previous);
      await qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setSaveState('saved');
      setError(null);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const isDirty = saveState === 'unsaved' || curriculumDirty;
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [isDirty]);

  const confirmNavigation = useCallback(() => !isDirty || window.confirm('You have unsaved changes. Leave the course builder?'), [isDirty]);
  useEffect(() => registerNavigationGuard(confirmNavigation), [confirmNavigation, registerNavigationGuard]);
  const back = () => { if (!confirmNavigation()) return; navigate('/admin/courses'); };
  const selectSection = (section: BuilderSection) => {
    if (!confirmNavigation()) return;
    // Preview and Publish reuse the curriculum editor's learner preview and readiness checklist
    // so publishing always passes through the authoritative readiness review.
    if (course && (section === 'preview' || (section === 'publish' && course.status === 'draft'))) {
      setActive('curriculum');
      setModalRequest({ kind: section === 'preview' ? 'preview' : 'readiness', nonce: Date.now() });
      return;
    }
    if (section === active) return;
    setActive(section);
  };
  const save = () => {
    if (!draft.title) { setError('Course title is required.'); setActive('information'); return; }
    if (isNew) create.mutate(); else update.mutate();
  };

  if (!isNew && courseQuery.isLoading) return <main className="p-8 text-sm text-ink-muted">Loading course builder…</main>;
  if (!isNew && (courseQuery.isError || !course)) return <main className="mx-auto max-w-3xl p-8"><p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft p-4 text-danger">{errorMessage(courseQuery.error)}</p><Button className="mt-4" onClick={() => navigate('/admin/courses')}>Back to courses</Button></main>;

  const status = course?.status ?? 'new draft';
  const titleForHeader = title.trim() || 'Create New Course';

  return <main className="min-h-full bg-app">
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={toggleGlobalNavigation} aria-label="Toggle global navigation" aria-expanded={globalNavigationOpen} className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><MenuIcon className="h-5 w-5" /></button><Link to="/" aria-label="VISTA home" onClick={(event) => { if (!confirmNavigation()) event.preventDefault(); }} className="hidden shrink-0 sm:block"><VistaMark compact /></Link><div className="min-w-0"><p className="text-xs text-ink-muted"><Link to="/admin/courses" onClick={(event) => { if (!confirmNavigation()) event.preventDefault(); }} className="text-accent-ink hover:underline">Course Management</Link> / Course Builder</p><h1 className="truncate text-lg font-semibold text-ink">{titleForHeader}<span className="ml-2 align-middle text-xs font-medium capitalize text-ink-muted">{status}</span></h1></div></div>
        <div className="flex items-center gap-2"><span role="status" className="hidden text-xs text-ink-muted sm:inline">{saveState === 'saved' && !curriculumDirty ? 'Saved' : 'Unsaved changes'}</span><Button size="sm" variant="secondary" icon={<EyeIcon className="h-4 w-4" />} onClick={() => selectSection('preview')}>Preview</Button><Button size="sm" icon={<SaveIcon className="h-4 w-4" />} loading={create.isPending || update.isPending} onClick={save}>Save Draft</Button></div>
      </div>
    </header>
    <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-8">
      <button type="button" onClick={back} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeftIcon className="h-4 w-4" />Back to Courses</button>
      {error && <p role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="grid min-h-[calc(100vh-170px)] gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Course builder navigation" className="h-fit rounded-xl border border-line bg-surface p-2 shadow-hairline lg:sticky lg:top-24">
          {sections.map((section) => <button key={section.id} type="button" onClick={() => selectSection(section.id)} aria-current={active === section.id ? 'page' : undefined} className={`mb-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active === section.id ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink'}`}>{section.icon}{section.label}</button>)}
        </nav>
        <section className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-hairline md:p-7">
          {active === 'information' && <div className="mx-auto max-w-3xl"><h2 className="text-xl font-semibold">Course Information</h2><p className="mt-1 text-sm text-ink-muted">Add the details available on the current course record.</p><label className="mt-6 block text-sm font-medium">Course title<input value={title} onChange={(event) => { setTitle(event.target.value); setSaveState('unsaved'); }} required maxLength={200} className="mt-1.5 h-11 w-full rounded-md border border-line-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="e.g. Robotics Fundamentals" /></label><label className="mt-4 block text-sm font-medium">Course description<textarea value={description} onChange={(event) => { setDescription(event.target.value); setSaveState('unsaved'); }} maxLength={4000} className="mt-1.5 min-h-36 w-full rounded-md border border-line-strong bg-surface p-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" placeholder="Describe what learners will learn." /></label><p className="mt-3 text-xs text-ink-subtle">Course-level objectives, thumbnail, difficulty, and duration are not supported by the current course API.</p></div>}
          {active === 'curriculum' && (course ? <><div className="mb-4"><h2 className="text-xl font-semibold">Edit Content</h2><p className="mt-1 text-sm text-ink-muted">Author the canonical course units, sections and learning activities. The backend preserves these learner-facing relationships.</p></div><CanonicalCurriculumEditor key={course.id} course={course as ApiCourse} token={token} onDirtyChange={setCurriculumDirty} modalRequest={modalRequest} /></> : <EmptyPanel title="Save the course details to start editing content" text="The course record is created only when you select Save Draft. You will stay in this builder after it is created." />)}
          {active === 'objectives' && <EmptyPanel title="Learning objectives" text="Learning objectives are currently supported at lesson level, not as course-level fields. Add lesson objectives in the curriculum editor." />}
          {active === 'media' && (course ? <div><h2 className="text-xl font-semibold">Learning Materials</h2><p className="mt-1 text-sm text-ink-muted">Upload and reuse private course-scoped videos, documents, and images.</p><MediaAssetLibraryModal open onClose={() => selectSection('curriculum')} courseId={course.id} token={token} /></div> : <EmptyPanel title="Save the course details to manage learning materials" text="The course record is created only when you select Save Draft. You can upload media after the course exists." />)}
          {active === 'versions' && <EmptyPanel title="Course versions are not available yet" text="The schema has no immutable course version snapshots or version API. Published content is a mutable course record, guarded against edits when learner delivery exists." />}
          {active === 'preview' && <EmptyPanel title="Preview availability" text={course ? 'A read-only preview is available from the curriculum editor. Draft preview is not exposed through the student route.' : 'Save a draft course before previewing curriculum.'} />}
          {active === 'publish' && <div className="max-w-2xl"><h2 className="text-xl font-semibold">Publish course</h2>{course ? <p className="mt-2 text-sm text-ink-muted">This course is {course.status}. Only draft courses can be published; use Edit Content → Review &amp; Publish to run the readiness checklist.</p> : <p className="mt-2 text-sm text-ink-muted">Save the course details before publishing.</p>}</div>}
        </section>
      </div>
    </div>
  </main>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) { return <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-line-strong bg-sunken/30 p-6"><h2 className="font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p></div>; }
