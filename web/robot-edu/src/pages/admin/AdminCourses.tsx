import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  FileEditIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { catalogApi, type ApiCourse } from '../../lib/api';
import { CanonicalCurriculumEditor } from './CanonicalCurriculumEditor';
import { MediaAssetLibraryModal } from '../../components/authoring/MediaAssetLibraryModal';
import { publishNotice } from '../../lib/publishNotice';

const STATUS_TONE: Record<string, BadgeTone> = {
  published: 'ok',
  draft: 'warn',
  archived: 'neutral',
};

const message = (e: unknown) => (e instanceof Error ? e.message : 'Could not update course.');

export function AdminCourses() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const qc = useQueryClient();

  const [selected, setSelected] = useState<ApiCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  // Learning Media is stored per course in private object storage, so the library opens for the selected course only.
  const openMediaLibrary = () => {
    if (!selected) { setError('Select a course first to manage its learning media.'); return; }
    setError(null);
    setMediaLibraryOpen(true);
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');

  const coursesQuery = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => catalogApi.courses(token, 1, 100),
    enabled: Boolean(token),
  });

  const allCourses = coursesQuery.data?.items ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'courses'] });

  const publish = useMutation({
    mutationFn: (id: string) => catalogApi.publishGlobalCourse(id, token),
    onSuccess: async (updated) => {
      await refresh();
      setSelected(updated);
      setError(null);
      setNotice(publishNotice(updated));
    },
    onError: (e) => setError(message(e)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => catalogApi.archiveGlobalCourse(id, token),
    onSuccess: async (updated) => {
      await refresh();
      setSelected(updated);
      setError(null);
      setNotice('Course archived successfully.');
    },
    onError: (e) => setError(message(e)),
  });

  const create = useMutation({
    mutationFn: (body: { title: string; description?: string }) => catalogApi.createGlobalCourse(token, body),
    onSuccess: async (created) => {
      await refresh();
      setCreateOpen(false);
      setSelected(created);
      setError(null);
      setNotice('Draft course created. Configure its curriculum below, then publish.');
    },
    onError: (e) => setError(message(e)),
  });

  const edit = useMutation({
    mutationFn: (body: { title: string; description?: string }) => catalogApi.updateGlobalCourse(selected!.id, token, body),
    onSuccess: async (updated) => {
      await refresh();
      setSelected(updated);
      setEditOpen(false);
      setError(null);
      setNotice('Course details updated successfully.');
    },
    onError: (e) => setError(message(e)),
  });

  const choose = (course: ApiCourse) => {
    if (selected?.id !== course.id && dirty && !window.confirm('Discard unsaved curriculum changes?')) return;
    setSelected(course);
    setError(null);
    setNotice(null);
  };

  const courseBody = (form: FormData) => {
    const title = String(form.get('title') ?? '').trim();
    if (!title) return null;
    const description = String(form.get('description') ?? '').trim();
    return { title, description: description || undefined };
  };

  // Derive compact statistics
  const stats = useMemo(() => {
    const total = allCourses.length;
    const published = allCourses.filter((c) => c.status === 'published').length;
    const draft = allCourses.filter((c) => c.status === 'draft').length;
    const archived = allCourses.filter((c) => c.status === 'archived').length;
    return { total, published, draft, archived };
  }, [allCourses]);

  // Client-side search and filtering
  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCourses.filter((course) => {
      const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
      const matchesQuery =
        !q ||
        course.title.toLowerCase().includes(q) ||
        (course.description && course.description.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [allCourses, search, statusFilter]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        eyebrow="Global course catalog"
        title="Course Management"
        description="Manage courses and curriculum across the VISTA platform."
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            Create Course
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 rounded-lg border border-accent/20 bg-accent-soft p-3 text-sm text-ink">
          {notice}
        </p>
      )}

      {/* Summary Statistics */}
      <section aria-label="Course summary statistics" className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Courses"
          value={stats.total}
          subtext="Canonical courses"
          icon={<BookOpenIcon className="h-4 w-4 text-accent" />}
        />
        <StatCard
          label="Published"
          value={stats.published}
          subtext="Live in catalog"
          tone="ok"
          icon={<CheckCircle2Icon className="h-4 w-4 text-ok" />}
        />
        <StatCard
          label="Draft"
          value={stats.draft}
          subtext="Authoring in progress"
          tone="warn"
          icon={<FileEditIcon className="h-4 w-4 text-warn" />}
        />
        <StatCard
          label="Archived"
          value={stats.archived}
          subtext="Retired templates"
          tone="neutral"
          icon={<ArchiveIcon className="h-4 w-4 text-ink-muted" />}
        />
      </section>

      {/* Coursera-Inspired Resource Hub (Reference 1) */}
      <section aria-label="Course builder resources" className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <BookOpenIcon className="h-5 w-5" />
              <h3 className="font-bold text-sm text-ink">Course Outline</h3>
            </div>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              The course outline is where you organize and structure your course content. Add lessons, quizzes, labs and instructional robotics activities.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-line/60">
            <Button
              size="sm"
              variant="primary"
              disabled={filteredCourses.length === 0}
              onClick={() => {
                if (filteredCourses[0]) choose(filteredCourses[0]);
              }}
            >
              Open Course Builder
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-500">
              <FolderOpenIcon className="h-5 w-5" />
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-ink">Manage Your Files</h3>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.2 text-3xs font-bold text-blue-600">BETA</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              Upload videos, reading documents, URDF models and datasets to use them seamlessly in your courses.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-line/60">
            <Button
              size="sm"
              variant="secondary"
              onClick={openMediaLibrary}
            >
              Open File Library
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 shadow-hairline flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-500">
              <FolderOpenIcon className="h-5 w-5" />
              <h3 className="font-bold text-sm text-ink">Asset Library</h3>
            </div>
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              Contains publicly accessible links and common instructional assets for VISTA robotics courses.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-line/60">
            <Button
              size="sm"
              variant="secondary"
              onClick={openMediaLibrary}
            >
              Open Asset Library
            </Button>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <label className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <SearchIcon className="h-4 w-4 text-ink-subtle shrink-0" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses..."
              aria-label="Search courses"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="text-ink-subtle hover:text-ink"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
            className="h-9 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="all">All statuses ({stats.total})</option>
            <option value="draft">Draft ({stats.draft})</option>
            <option value="published">Published ({stats.published})</option>
            <option value="archived">Archived ({stats.archived})</option>
          </select>
        </div>

        <span className="text-xs text-ink-muted">
          Showing {filteredCourses.length} of {stats.total} course{stats.total === 1 ? '' : 's'}
        </span>
      </div>

      {/* Course Listing Table */}
      {coursesQuery.isLoading ? (
        <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface p-6 animate-pulse">
          <div className="h-5 w-48 bg-sunken rounded" />
          <div className="h-10 bg-sunken rounded mt-4" />
          <div className="h-10 bg-sunken rounded" />
          <div className="h-10 bg-sunken rounded" />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<BookOpenIcon className="h-8 w-8 text-ink-muted" />}
            title={stats.total === 0 ? 'No courses yet' : 'No matching courses'}
            description={
              stats.total === 0
                ? 'Create your first canonical global course to begin authoring curriculum.'
                : 'Try clearing your search query or changing the status filter.'
            }
          />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-hairline">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm" aria-label="Course management list">
              <thead>
                <tr className="border-b border-line bg-sunken/40 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  <th scope="col" className="px-5 py-3.5">Course</th>
                  <th scope="col" className="px-4 py-3.5">Description</th>
                  <th scope="col" className="px-4 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredCourses.map((course) => {
                  const isSelected = selected?.id === course.id;
                  const tone = STATUS_TONE[course.status] ?? 'neutral';
                  return (
                    <tr
                      key={course.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-accent-soft/40'
                          : 'hover:bg-sunken/40'
                      }`}
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => choose(course)}
                          className="w-full text-left group"
                          aria-label={`Select ${course.title}`}
                        >
                          <p className="font-semibold text-ink group-hover:text-accent transition-colors">
                            {course.title}
                          </p>
                          <p className="text-2xs font-mono text-ink-subtle mt-0.5">{course.id}</p>
                        </button>
                      </td>
                      <td className="px-4 py-4 max-w-sm">
                        <p className="line-clamp-2 text-sm text-ink-muted">
                          {course.description || <span className="italic text-ink-subtle">No description</span>}
                        </p>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge tone={tone} dot>
                          {course.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={isSelected ? 'primary' : 'secondary'}
                            onClick={() => choose(course)}
                          >
                            Manage curriculum
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              choose(course);
                              setEditOpen(true);
                            }}
                          >
                            Edit details
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => publish.mutate(course.id)}
                            disabled={course.status !== 'draft'}
                            loading={publish.isPending && selected?.id === course.id}
                          >
                            Publish
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => archive.mutate(course.id)}
                            disabled={course.status === 'archived'}
                            loading={archive.isPending && selected?.id === course.id}
                          >
                            Archive
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Curriculum Editor Panel */}
      {selected && (
        <section className="mt-8 border-t border-line pt-8" aria-labelledby="curriculum-editor-section">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-accent-ink">
                Canonical Curriculum
              </span>
              <h2 id="curriculum-editor-section" className="text-xl font-semibold text-ink">
                {selected.title}
              </h2>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved curriculum changes?')) return;
                setSelected(null);
              }}
            >
              Close editor
            </Button>
          </div>

          <CanonicalCurriculumEditor
            key={selected.id}
            course={selected}
            token={token}
            onDirtyChange={setDirty}
          />
        </section>
      )}

      {/* Create Course Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create course"
        description="Creates a draft global course template. Add its lessons, sections, and activities next, then publish."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-course-form" loading={create.isPending}>
              Create course
            </Button>
          </>
        }
      >
        <form
          id="create-course-form"
          onSubmit={(event) => {
            event.preventDefault();
            const body = courseBody(new FormData(event.currentTarget));
            if (body) create.mutate(body);
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-medium text-ink">
            Course title
            <input
              name="title"
              required
              aria-label="Course title"
              placeholder="e.g. Dual-Arm Robotics Manipulation"
              className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Description
            <textarea
              name="description"
              aria-label="Course description"
              placeholder="Describe the learning objectives and robot manipulation skills covered in this course..."
              className="mt-1.5 min-h-24 w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </form>
      </Dialog>

      {/* Edit Course Details Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit course details"
        description="Update the course title and overview description."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-course-form" loading={edit.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {selected && (
          <form
            id="edit-course-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (dirty && !window.confirm('Discard unsaved curriculum changes?')) return;
              const body = courseBody(new FormData(event.currentTarget));
              if (body) edit.mutate(body);
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium text-ink">
              Course title
              <input
                name="title"
                required
                defaultValue={selected.title}
                aria-label="Course title"
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Description
              <textarea
                name="description"
                defaultValue={selected.description ?? ''}
                aria-label="Course description"
                className="mt-1.5 min-h-24 w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </form>
        )}
      </Dialog>

      {selected && (
        <MediaAssetLibraryModal
          open={mediaLibraryOpen}
          onClose={() => setMediaLibraryOpen(false)}
          courseId={selected.id}
          token={token}
        />
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  subtext,
  tone,
  icon,
}: {
  label: string;
  value: number;
  subtext: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5 shadow-hairline">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold tracking-tight text-ink">{value}</p>
        {tone && (
          <Badge tone={tone} dot className="scale-90 origin-left">
            {tone === 'ok' ? 'Live' : tone === 'warn' ? 'Draft' : 'Archived'}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-2xs text-ink-subtle">{subtext}</p>
    </article>
  );
}
