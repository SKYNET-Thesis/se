import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenIcon, PencilIcon, SearchIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi, type ApiCourse } from '../../lib/api';
import { schoolAdminKeys } from '../../queries/schoolAdminQueries';

export function SchoolCourses() {
  const { session } = useSupabaseSession();
  const { memberships } = useRole();
  const token = session?.access_token ?? '';
  const organizationId = memberships.find(item => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ApiCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const courses = useQuery({
    queryKey: schoolAdminKeys.courses(organizationId),
    queryFn: () => educationAdminApi.courses(organizationId, token),
    enabled: Boolean(organizationId && token),
  });
  const updateCourse = useMutation({
    mutationFn: (body: { title: string; description?: string }) => educationAdminApi.updateCourse(organizationId, editing?.id ?? '', token, body),
    onSuccess: async () => {
      setEditing(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: schoolAdminKeys.courses(organizationId) });
    },
    onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to update course.'),
  });
  const visibleCourses = (courses.data ?? []).filter(course => {
    const term = search.trim().toLowerCase();
    return !term || `${course.title} ${course.description ?? ''}`.toLowerCase().includes(term);
  });

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
    <PageHeader title="Courses" description="Manage the courses owned by your organization. Changes apply only to your school." />
    {(error || courses.error instanceof Error) && <p role="alert" className="mt-5 rounded-md bg-danger-soft p-3 text-sm text-danger">{error ?? (courses.error as Error).message}</p>}
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-2xl font-semibold tracking-[-.04em] text-ink">Organization courses</h2><p className="mt-1 text-sm text-ink-muted">{courses.isPending ? 'Loading courses…' : `${visibleCourses.length} course${visibleCourses.length === 1 ? '' : 's'} shown`}</p></div>
        <label className="flex h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-muted sm:w-72"><SearchIcon className="h-4 w-4" /><span className="sr-only">Search courses</span><input value={search} onChange={event => setSearch(event.target.value)} className="w-full bg-transparent outline-none" placeholder="Search courses" /></label>
      </div>
      {courses.isPending ? <CourseListSkeleton /> : visibleCourses.length === 0 ? <div className="mt-7"><EmptyState icon={<BookOpenIcon />} title={courses.data?.length ? 'No matching courses' : 'No organization courses'} description={courses.data?.length ? 'Try a different search.' : 'Courses created for your organization will appear here.'} /></div> : <div className="mt-6 grid gap-4 md:grid-cols-2">{visibleCourses.map(course => <CourseCard key={course.id} course={course} onEdit={() => { setError(null); setEditing(course); }} />)}</div>}
    </section>
    <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit course" description="Update the course information for your organization." footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="edit-school-course" loading={updateCourse.isPending}>Save changes</Button></>}>
      <form id="edit-school-course" className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') ?? '').trim(); if (!title) { setError('Course title cannot be empty.'); return; } updateCourse.mutate({ title, description: String(form.get('description') ?? '').trim() || undefined }); }}>
        <label className="block text-sm font-medium text-ink">Title<input required maxLength={200} name="title" defaultValue={editing?.title ?? ''} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" /></label>
        <label className="block text-sm font-medium text-ink">Description<textarea maxLength={4000} name="description" defaultValue={editing?.description ?? ''} className="mt-1.5 min-h-28 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm" /></label>
      </form>
    </Dialog>
  </main>;
}

function CourseCard({ course, onEdit }: { course: ApiCourse; onEdit: () => void }) {
  return <article className="rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Organization course</p><h3 className="mt-2 text-xl font-semibold tracking-[-.02em] text-ink">{course.title}</h3></div><span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold capitalize text-ink-muted">{course.status}</span></div><p className="mt-3 min-h-12 text-sm leading-6 text-ink-muted">{course.description || 'No description provided.'}</p><Button size="sm" variant="secondary" icon={<PencilIcon className="h-3.5 w-3.5" />} onClick={onEdit} className="mt-5">Edit course</Button></article>;
}

function CourseListSkeleton() {
  return <div className="mt-6 grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-xl border border-line bg-sunken/60" />)}</div>;
}
