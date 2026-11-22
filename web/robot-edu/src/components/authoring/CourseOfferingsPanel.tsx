import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RadioIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useOptionalRole } from '../../contexts/RoleContext';
import { educationAdminApi, type ApiCourse } from '../../lib/api';
import { schoolAdminKeys } from '../../queries/schoolAdminQueries';
import { canCreateOffering, offeringScope, offeringsOfCourse, offeringTermLabel } from './courseOfferingsModel';

const field = 'mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm';

/**
 * Offerings of ONE course, inside Course management. A course is shared content; each offering delivers it to one school's classrooms,
 * so a course can have many offerings (several schools, several per school) and nothing is copied. Uses the existing school-scoped
 * offering endpoints; the server decides who may read or create.
 */
export function CourseOfferingsPanel({ course, token }: { course: Pick<ApiCourse, 'id' | 'title' | 'status' | 'organizationId'>; token: string }) {
  const roleContext = useOptionalRole();
  const scope = offeringScope({ role: roleContext?.role, memberships: roleContext?.memberships ?? [], courseOrganizationId: course.organizationId });
  const [chosenSchool, setChosenSchool] = useState('');
  const schools = useQuery({ queryKey: ['course-offerings', 'managed-schools'], queryFn: () => educationAdminApi.managedOrganizations(token), enabled: scope.kind === 'choose-school' && Boolean(token) });
  const organizationId = scope.kind === 'school' ? scope.organizationId : scope.kind === 'choose-school' ? chosenSchool : '';
  if (scope.kind === 'hidden') return null;
  if (scope.kind === 'foreign-school') return <PanelShell><p className="text-sm text-ink-muted">This course belongs to another school, so its offerings are managed there.</p></PanelShell>;
  return (
    <PanelShell>
      {scope.kind === 'choose-school' && (
        <label className="block max-w-sm text-sm font-medium text-ink">School
          <select aria-label="School" className={field} value={chosenSchool} onChange={(event) => setChosenSchool(event.target.value)} disabled={schools.isPending}>
            <option value="">{schools.isPending ? 'Loading schools…' : 'Choose a school'}</option>
            {(schools.data ?? []).filter((school) => school.status === 'active').map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
          {schools.error instanceof Error && <span role="alert" className="mt-1 block text-xs text-danger">Schools could not be loaded.</span>}
        </label>
      )}
      {organizationId
        ? <Offerings course={course} token={token} organizationId={organizationId} canCreate={scope.kind === 'choose-school' || scope.canCreate} />
        : <p className="text-sm text-ink-muted">Choose a school to see and create its offerings of this course.</p>}
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return <section aria-label="Course offerings" className="max-w-3xl space-y-4 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6">
    <div><h3 className="text-lg font-bold">Offerings</h3><p className="mt-0.5 text-xs text-ink-muted">An offering delivers this course to one school&apos;s classrooms. The course content is shared, never copied, and a course can have several offerings.</p></div>
    {children}
  </section>;
}

function Offerings({ course, token, organizationId, canCreate }: { course: Pick<ApiCourse, 'id' | 'title' | 'status'>; token: string; organizationId: string; canCreate: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: schoolAdminKeys.offerings(organizationId), queryFn: () => educationAdminApi.offerings(organizationId, token), enabled: Boolean(organizationId && token) });
  const rows = offeringsOfCourse(list.data, course.id);
  const create = useMutation({
    mutationFn: (body: { courseId: string; code: string; title?: string; academicTerm?: string; academicYear?: number }) => educationAdminApi.createCourseOffering(organizationId, token, body),
    onSuccess: async () => { setOpen(false); setError(null); await queryClient.invalidateQueries({ queryKey: schoolAdminKeys.offerings(organizationId) }); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'The offering could not be created.'),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').trim();
    if (!code) { setError('Enter an offering code.'); return; }
    const year = String(form.get('academicYear') ?? '').trim();
    if (year && !/^\d{4}$/.test(year)) { setError('Academic year must be a four-digit year.'); return; }
    create.mutate({ courseId: course.id, code, title: String(form.get('title') ?? '').trim() || undefined, academicTerm: String(form.get('academicTerm') ?? '').trim() || undefined, academicYear: year ? Number(year) : undefined });
  };
  const publishedOnly = !canCreateOffering(course.status);
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted" role="status">{list.isPending ? 'Loading offerings…' : `${rows.length} offering${rows.length === 1 ? '' : 's'} of this course`}</p>
      {canCreate && <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} disabled={publishedOnly} title={publishedOnly ? 'Publish the course before creating offerings.' : undefined} onClick={() => { setError(null); setOpen(true); }}>New offering</Button>}
    </div>
    {publishedOnly && canCreate && <p className="text-xs text-ink-muted">Only a published course can be offered. Publish it through Review &amp; Publish first.</p>}
    {list.error instanceof Error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">Offerings could not be loaded. <button type="button" className="font-medium underline" onClick={() => void list.refetch()}>Try again</button></p>}
    {!list.isPending && !list.error && rows.length === 0 && <p className="flex items-center gap-2 rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-muted"><RadioIcon className="h-4 w-4 shrink-0" aria-hidden />No offerings of this course yet in this school.</p>}
    {rows.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line">{rows.map((offering) => <li key={offering.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0"><p className="truncate font-medium text-ink">{offering.title}</p><p className="text-xs text-ink-muted"><span className="font-mono">{offering.code}</span> · {offeringTermLabel(offering)} · {offering.classrooms ?? 0} classroom{offering.classrooms === 1 ? '' : 's'}</p></div>
      <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold capitalize text-ink-muted">{offering.status}</span>
    </li>)}</ul>}
    <p className="text-xs text-ink-muted">Editing and activating offerings, and creating classrooms from them, stays in <Link to="/school/offerings" className="font-medium text-accent underline">School offerings</Link>.</p>
    <Dialog open={open} onClose={() => setOpen(false)} title="New offering" description={`Delivers “${course.title}” to this school. It starts as a draft.`} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="course-offering-form" loading={create.isPending}>Create draft</Button></>}>
      <form id="course-offering-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <label className="block text-sm font-medium text-ink">Offering code<input required maxLength={80} name="code" placeholder="ROBOTICS-2026-A" className={field} /></label>
        <label className="block text-sm font-medium text-ink">Title <span className="font-normal text-ink-muted">(optional)</span><input maxLength={200} name="title" placeholder={course.title} className={field} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">Academic term <span className="font-normal text-ink-muted">(optional)</span><input maxLength={80} name="academicTerm" placeholder="Fall" className={field} /></label>
          <label className="block text-sm font-medium text-ink">Academic year <span className="font-normal text-ink-muted">(optional)</span><input inputMode="numeric" maxLength={4} name="academicYear" placeholder="2026" className={field} /></label>
        </div>
      </form>
    </Dialog>
  </>;
}
