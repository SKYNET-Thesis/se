import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArchiveIcon, ArrowLeftIcon, GraduationCapIcon, RotateCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ClassroomCodeTag, ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { ClassroomFormDialog } from '../../components/school/ClassroomFormDialog';
import { ClassroomLifecycleDialog } from '../../components/school/ClassroomLifecycleDialog';
import { ReassignOfferingDialog } from '../../components/school/ReassignOfferingDialog';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ClassroomFormValues } from '../../queries/classroomsModel';
import { canReassignOffering, enrollmentLabel, isArchived, lifecycleAction } from '../../queries/classroomsModel';
import { useClassroomMutations, useSchoolClassroom, useSchoolScope } from '../../queries/schoolClassrooms';
import { ClassroomMembersSection } from './ClassroomMembersSection';
import { ClassroomRobotAllocation } from './ClassroomRobotAllocation';

const backLink = <Link to="/school/classrooms" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeftIcon className="h-4 w-4" aria-hidden />Classrooms</Link>;

/** A01 Classroom Detail at /school/classrooms/:classroomId. Works on direct navigation and refresh (see useSchoolClassroom). */
export function ClassroomDetailPage() {
  const { classroomId = '' } = useParams();
  const scope = useSchoolScope();
  const { classroom, loading, notFound, error, refetch, refreshing } = useSchoolClassroom(scope, classroomId);
  const mutations = useClassroomMutations(scope);
  const [editOpen, setEditOpen] = useState(false);
  const [offeringOpen, setOfferingOpen] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);

  const shell = (content: ReactNode) => <div className="vista-school mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:px-10"><nav aria-label="Breadcrumb">{backLink}</nav>{content}</div>;

  if (loading) return shell(<DetailSkeleton />);
  if (!scope.organizationId) return shell(<EmptyState className="mt-8" icon={<GraduationCapIcon />} title="No school to manage" description="Your account has no active school administrator membership." />);
  if (error && !classroom) return shell(
    <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
      <span>{error instanceof Error ? error.message : 'This classroom could not be loaded.'}</span>
      <Button size="sm" variant="secondary" onClick={() => void refetch()} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
    </div>);
  if (notFound || !classroom) return shell(
    <EmptyState className="mt-8" icon={<GraduationCapIcon />} title="Classroom not found" description="It may have been removed, or it belongs to another school. Check the link or choose a classroom from the list."
      action={<Link to="/school/classrooms" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-sunken">Back to classrooms</Link>} />);

  const archived = isArchived(classroom);
  const action = lifecycleAction(classroom);
  const reassignReasonId = 'reassign-disabled-reason';
  const save = async (values: ClassroomFormValues) => { await mutations.update.mutateAsync({ classroomId: classroom.id, values }); setEditOpen(false); toast.success('Classroom saved'); };
  const confirmLifecycle = async () => {
    if (action === 'archive') await mutations.archive.mutateAsync(classroom.id); else await mutations.reactivate.mutateAsync(classroom.id);
    setLifecycleOpen(false); toast.success(action === 'archive' ? 'Classroom archived' : 'Classroom reactivated');
  };

  return shell(<>
    <header className="mt-4 flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><ClassroomCodeTag code={classroom.code} /><ClassroomStatusBadge status={classroom.status} />{refreshing && <span aria-live="polite" className="text-xs text-ink-muted">Refreshing…</span>}</div>
        <h1 className="mt-2 break-words text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink [text-wrap:balance]">{classroom.name}</h1>
        {classroom.description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted [text-wrap:pretty]">{classroom.description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit details</Button>
        <Button variant="secondary" onClick={() => setOfferingOpen(true)} disabled={!canReassignOffering(classroom)} aria-describedby={archived ? reassignReasonId : undefined}>Reassign course</Button>
        {action === 'archive'
          ? <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setLifecycleOpen(true)} icon={<ArchiveIcon className="h-4 w-4" aria-hidden />}>Archive</Button>
          : <Button variant="primary" onClick={() => setLifecycleOpen(true)} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Reactivate</Button>}
      </div>
    </header>

    {archived && (
      <p id={reassignReasonId} role="status" className="mt-5 border-l-4 border-line-strong bg-sunken p-3 text-sm text-ink">
        This classroom is archived, so its students no longer have course access through it. Reactivate it before changing its course offering.
      </p>
    )}

    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-[10px] border border-line bg-surface p-5 lg:grid-cols-4">
      <Fact label="Course offering" value={classroom.offering_title ?? 'No course offering'} muted={!classroom.offering_title} wide />
      <Fact label={classroom.capacity ? 'Students / capacity' : 'Students'} value={enrollmentLabel(classroom)} numeric />
      <Fact label="Teaching staff" value={classroom.teaching_staff_count ? String(classroom.teaching_staff_count) : 'None assigned'} muted={!classroom.teaching_staff_count} numeric={Boolean(classroom.teaching_staff_count)} />
      <Fact label="Robot" value={classroom.allocated_robot?.name ?? 'Not assigned'} muted={!classroom.allocated_robot} />
    </dl>

    <section aria-label="Classroom quiz deliveries" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface p-5">
      <div><h2 className="text-base font-semibold text-ink">Quiz deliveries</h2><p className="mt-1 text-sm text-ink-muted">Schedule and publish Question Bank quizzes for this classroom.</p></div>
      <Link to={`/school/quizzes?classroomId=${classroom.id}`} className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken">Manage quiz deliveries</Link>
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div><ClassroomMembersSection organizationId={scope.organizationId} classroomId={classroom.id} classroomName={classroom.name} token={scope.token} /></div>
      <div><ClassroomRobotAllocation organizationId={scope.organizationId} classroomId={classroom.id} token={scope.token} currentRobot={classroom.allocated_robot} /></div>
    </div>

    <ClassroomFormDialog open={editOpen} mode="edit" scope={scope} classroom={classroom} pending={mutations.update.isPending} onSubmit={save} onClose={() => setEditOpen(false)} />
    <ReassignOfferingDialog open={offeringOpen} scope={scope} classroom={classroom} onClose={() => setOfferingOpen(false)} />
    <ClassroomLifecycleDialog action={action} classroom={lifecycleOpen ? classroom : null} pending={mutations.archive.isPending || mutations.reactivate.isPending} onConfirm={confirmLifecycle} onClose={() => setLifecycleOpen(false)} />
  </>);
}

function Fact({ label, value, muted, numeric, wide }: { label: string; value: string; muted?: boolean; numeric?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0 lg:col-span-1' : 'min-w-0'}>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={`mt-1 break-words text-[15px] font-medium ${muted ? 'text-ink-subtle' : 'text-ink'} ${numeric ? 'tabular-nums' : ''}`}>{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading classroom…" className="mt-4 animate-pulse">
      <div className="h-5 w-32 rounded bg-sunken" /><div className="mt-3 h-7 w-72 max-w-full rounded bg-sunken" />
      <div className="mt-6 h-24 rounded-[10px] bg-sunken" /><div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="h-64 rounded-[10px] bg-sunken" /><div className="h-64 rounded-[10px] bg-sunken" /></div>
    </div>
  );
}
