import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, CheckCircle2Icon, PencilIcon, PlusIcon, RadioIcon, UsersIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi, type ApiOffering } from '../../lib/api';
import { schoolAdminKeys } from '../../queries/schoolAdminQueries';

const toDateInputValue = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

const formatDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function SchoolOfferings() {
  const { session } = useSupabaseSession();
  const { memberships } = useRole();
  const token = session?.access_token ?? '';
  const organizationId = memberships.find(item => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiOffering | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offerings = useQuery({
    queryKey: schoolAdminKeys.offerings(organizationId),
    queryFn: () => educationAdminApi.offerings(organizationId, token),
    enabled: Boolean(organizationId && token),
  });

  const publishedCourses = useQuery({
    queryKey: ['school-admin', organizationId, 'published-courses'],
    queryFn: () => educationAdminApi.publishedCourses(organizationId, token),
    enabled: createOpen && Boolean(organizationId && token),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: schoolAdminKeys.offerings(organizationId) });

  const createOffering = useMutation({
    mutationFn: (body: {
      courseId: string;
      code: string;
      title?: string;
      academicTerm?: string;
      academicYear?: number;
      startAt?: string;
      endAt?: string;
      enrollmentOpenAt?: string;
      enrollmentCloseAt?: string;
      maxStudents?: number;
    }) => educationAdminApi.createCourseOffering(organizationId, token, body),
    onSuccess: async () => { setCreateOpen(false); setError(null); await refresh(); },
    onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to create offering.'),
  });

  const updateOffering = useMutation({
    mutationFn: (body: {
      code?: string;
      title?: string;
      academicTerm?: string;
      academicYear?: number;
      startAt?: string;
      endAt?: string;
      enrollmentOpenAt?: string;
      enrollmentCloseAt?: string;
      maxStudents?: number;
    }) => educationAdminApi.updateCourseOffering(organizationId, editing?.id ?? '', token, body),
    onSuccess: async () => { setEditing(null); setError(null); await refresh(); },
    onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to update offering.'),
  });

  const activateOffering = useMutation({
    mutationFn: (offeringId: string) => educationAdminApi.activateCourseOffering(organizationId, offeringId, token),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to activate offering.'),
  });

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const courseId = String(form.get('courseId') ?? '');
    const code = String(form.get('code') ?? '').trim();
    if (!courseId || !code) { setError('Choose a published course and enter an offering code.'); return; }

    const title = String(form.get('title') ?? '').trim() || undefined;
    const academicTerm = String(form.get('academicTerm') ?? '').trim() || undefined;
    const academicYearRaw = form.get('academicYear');
    const academicYear = academicYearRaw ? Number(academicYearRaw) : undefined;
    const startAt = String(form.get('startAt') ?? '').trim() || undefined;
    const endAt = String(form.get('endAt') ?? '').trim() || undefined;
    const enrollmentOpenAt = String(form.get('enrollmentOpenAt') ?? '').trim() || undefined;
    const enrollmentCloseAt = String(form.get('enrollmentCloseAt') ?? '').trim() || undefined;
    const maxStudentsRaw = form.get('maxStudents');
    const maxStudents = maxStudentsRaw ? Number(maxStudentsRaw) : undefined;

    createOffering.mutate({
      courseId,
      code,
      title,
      academicTerm,
      academicYear,
      startAt,
      endAt,
      enrollmentOpenAt,
      enrollmentCloseAt,
      maxStudents,
    });
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').trim();
    if (!code) { setError('Offering code cannot be empty.'); return; }

    const title = String(form.get('title') ?? '').trim() || undefined;
    const academicTerm = String(form.get('academicTerm') ?? '').trim() || undefined;
    const academicYearRaw = form.get('academicYear');
    const academicYear = academicYearRaw ? Number(academicYearRaw) : undefined;
    const startAt = String(form.get('startAt') ?? '').trim() || undefined;
    const endAt = String(form.get('endAt') ?? '').trim() || undefined;
    const enrollmentOpenAt = String(form.get('enrollmentOpenAt') ?? '').trim() || undefined;
    const enrollmentCloseAt = String(form.get('enrollmentCloseAt') ?? '').trim() || undefined;
    const maxStudentsRaw = form.get('maxStudents');
    const maxStudents = maxStudentsRaw ? Number(maxStudentsRaw) : undefined;

    updateOffering.mutate({
      code,
      title,
      academicTerm,
      academicYear,
      startAt,
      endAt,
      enrollmentOpenAt,
      enrollmentCloseAt,
      maxStudents,
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Offerings" description="Prepare and activate organization-specific delivery instances for published courses." />
      {error && <p role="alert" className="mt-5 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <section className="mt-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-.04em] text-ink">Delivery offerings</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {offerings.isPending ? 'Loading offerings…' : `${offerings.data?.length ?? 0} offering${offerings.data?.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button onClick={() => { setError(null); setCreateOpen(true); }} icon={<PlusIcon className="h-4 w-4" />}>
            New offering
          </Button>
        </header>
        {offerings.error instanceof Error && <p role="alert" className="mt-5 rounded-md bg-danger-soft p-3 text-sm text-danger">{offerings.error.message}</p>}
        {offerings.isPending ? (
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg border border-line bg-sunken/60" />)}
          </div>
        ) : offerings.data?.length === 0 ? (
          <div className="mt-7">
            <EmptyState
              icon={<RadioIcon />}
              title="No offerings yet"
              description="Create an offering from a published course owned by your school or available globally, then activate it before assigning classrooms."
            />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
            <div className="divide-y divide-line">
              {offerings.data?.map(offering => (
                <OfferingRow
                  key={offering.id}
                  offering={offering}
                  activating={activateOffering.isPending && activateOffering.variables === offering.id}
                  onEdit={() => { setError(null); setEditing(offering); }}
                  onActivate={() => { setError(null); activateOffering.mutate(offering.id); }}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Create Offering Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New course offering"
        description="Configure an academic delivery instance for a published course. Offerings start in draft status until activated."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-offering" loading={createOffering.isPending}>Create draft</Button>
          </>
        }
      >
        <form id="create-offering" onSubmit={submitCreate} className="space-y-4">
          <label className="block text-sm font-medium text-ink">
            Published course <span className="text-danger">*</span>
            <select required name="courseId" disabled={publishedCourses.isPending} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm">
              <option value="">{publishedCourses.isPending ? 'Loading published courses…' : 'Select a published course'}</option>
              {publishedCourses.data?.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Offering code <span className="text-danger">*</span>
              <input required maxLength={80} name="code" placeholder="e.g. SO100-2026-FA" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Title <span className="font-normal text-ink-muted">(optional, defaults to course title)</span>
              <input maxLength={200} name="title" placeholder="e.g. SO-100 Robotics — Fall 2026" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Academic term <span className="font-normal text-ink-muted">(optional)</span>
              <input maxLength={80} name="academicTerm" placeholder="e.g. Fall, Spring, Semester 1" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Academic year <span className="font-normal text-ink-muted">(optional)</span>
              <input type="number" min="2000" max="9999" name="academicYear" placeholder={`e.g. ${new Date().getFullYear()}`} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Course start date <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="startAt" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Course end date <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="endAt" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-ink">
              Enrollment open <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="enrollmentOpenAt" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Enrollment close <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="enrollmentCloseAt" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Max students <span className="font-normal text-ink-muted">(optional)</span>
              <input type="number" min="1" max="10000" name="maxStudents" placeholder="e.g. 100" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>
        </form>
      </Dialog>

      {/* Edit Offering Dialog */}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit draft offering"
        description="Draft offerings can be configured before activation. Once active, classrooms can be assigned."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-offering" loading={updateOffering.isPending}>Save changes</Button>
          </>
        }
      >
        <form id="edit-offering" onSubmit={submitEdit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Offering code <span className="text-danger">*</span>
              <input required maxLength={80} name="code" defaultValue={editing?.code ?? ''} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Title <span className="font-normal text-ink-muted">(optional)</span>
              <input maxLength={200} name="title" defaultValue={editing?.title ?? ''} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Academic term <span className="font-normal text-ink-muted">(optional)</span>
              <input maxLength={80} name="academicTerm" defaultValue={editing?.academicTerm ?? ''} placeholder="e.g. Fall, Spring, Semester 1" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Academic year <span className="font-normal text-ink-muted">(optional)</span>
              <input type="number" min="2000" max="9999" name="academicYear" defaultValue={editing?.academicYear ?? ''} placeholder="e.g. 2026" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Course start date <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="startAt" defaultValue={toDateInputValue(editing?.startAt)} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Course end date <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="endAt" defaultValue={toDateInputValue(editing?.endAt)} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-ink">
              Enrollment open <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="enrollmentOpenAt" defaultValue={toDateInputValue(editing?.enrollmentOpenAt)} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Enrollment close <span className="font-normal text-ink-muted">(optional)</span>
              <input type="date" name="enrollmentCloseAt" defaultValue={toDateInputValue(editing?.enrollmentCloseAt)} className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
            <label className="block text-sm font-medium text-ink">
              Max students <span className="font-normal text-ink-muted">(optional)</span>
              <input type="number" min="1" max="10000" name="maxStudents" defaultValue={editing?.maxStudents ?? ''} placeholder="e.g. 100" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </label>
          </div>
        </form>
      </Dialog>
    </main>
  );
}

function OfferingRow({ offering, activating, onEdit, onActivate }: { offering: ApiOffering; activating: boolean; onEdit: () => void; onActivate: () => void }) {
  const active = offering.status === 'active';
  const termAndYear = [offering.academicTerm, offering.academicYear].filter(Boolean).join(' ');
  const startDate = formatDate(offering.startAt);
  const endDate = formatDate(offering.endAt);
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate ? `Starts ${startDate}` : endDate ? `Ends ${endDate}` : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{offering.title}</h3>
          <span className={active ? 'rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold capitalize text-accent-strong' : 'rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold capitalize text-ink-muted'}>
            {offering.status}
          </span>
          {termAndYear && (
            <span className="rounded-md border border-line bg-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
              {termAndYear}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <p>Code <span className="font-medium text-ink">{offering.code}</span></p>
          {dateRange && (
            <p className="flex items-center gap-1">
              <CalendarIcon className="h-3.5 w-3.5 text-ink-subtle" />
              <span>{dateRange}</span>
            </p>
          )}
          {(offering.maxStudents || (offering.enrolledStudents ?? 0) > 0) && (
            <p className="flex items-center gap-1">
              <UsersIcon className="h-3.5 w-3.5 text-ink-subtle" />
              <span>{offering.maxStudents ? `${offering.enrolledStudents ?? 0} of ${offering.maxStudents} places taken` : `${offering.enrolledStudents} students enrolled`}</span>
            </p>
          )}
          <span>{active ? '· Ready for classroom assignment' : '· Activate before assigning a classroom'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!active && (
          <>
            <Button size="sm" variant="secondary" icon={<PencilIcon className="h-3.5 w-3.5" />} onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" icon={<CheckCircle2Icon className="h-3.5 w-3.5" />} loading={activating} onClick={onActivate}>
              Activate
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
