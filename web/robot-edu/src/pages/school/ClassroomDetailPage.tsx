import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArchiveIcon, ArrowLeftIcon, GraduationCapIcon, PencilIcon, RotateCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ClassroomCodeTag, ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { ClassroomFormDialog } from '../../components/school/ClassroomFormDialog';
import { ClassroomLifecycleDialog } from '../../components/school/ClassroomLifecycleDialog';
import { ReassignOfferingDialog } from '../../components/school/ReassignOfferingDialog';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ClassroomFormValues } from '../../queries/classroomsModel';
import { canReassignOffering, isArchived, lifecycleAction } from '../../queries/classroomsModel';
import { lifecycleOutcome } from '../../queries/classroomLifecycleModel';
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

  const shell = (content: ReactNode) => <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 lg:px-10 lg:py-7"><nav aria-label="Breadcrumb">{backLink}</nav>{content}</div>;

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
    const response = action === 'archive' ? await mutations.archive.mutateAsync(classroom.id) : await mutations.reactivate.mutateAsync(classroom.id);
    setLifecycleOpen(false); const outcome = lifecycleOutcome(action, response, classroom); toast.success(outcome.title, { description: outcome.description });
  };

  return shell(<>
    <header className="mt-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><ClassroomCodeTag code={classroom.code} /><ClassroomStatusBadge status={classroom.status} />{refreshing && <span aria-live="polite" className="text-xs text-ink-muted">Refreshing…</span>}</div>
          <h1 className="mt-2 break-words text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink [text-wrap:balance]">{classroom.name}</h1>
          {classroom.description && <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-ink-muted [text-wrap:pretty]">{classroom.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action === 'reactivate'
            ? <Button variant="primary" onClick={() => setLifecycleOpen(true)} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Reactivate</Button>
            : <Button variant="primary" onClick={() => setEditOpen(true)} icon={<PencilIcon className="h-4 w-4" aria-hidden />}>Edit details</Button>}
          {action === 'reactivate' && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit details</Button>}
          <Button variant="secondary" onClick={() => setOfferingOpen(true)} disabled={!canReassignOffering(classroom)} aria-describedby={archived ? reassignReasonId : undefined}>Change course</Button>
          {action === 'archive' && (
            <ActionMenu label="More actions" triggerClassName="h-9 w-9 border border-line-strong bg-surface"
              items={[{ kind: 'button', label: 'Archive classroom', tone: 'danger', icon: <ArchiveIcon className="h-4 w-4" aria-hidden />, onSelect: () => setLifecycleOpen(true) }]} />
          )}
        </div>
      </div>

      {archived && (
        <p id={reassignReasonId} role="status" className="mt-4 border-l-4 border-line-strong bg-sunken px-3 py-2.5 text-sm text-ink">
          Archived. Students can’t reach this course through this classroom. Reactivate it to change the course.
        </p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-3.5 sm:flex sm:flex-wrap sm:gap-x-10">
        <Fact label="Course" wide>{classroom.offering_title ?? <span className="text-ink-subtle">No course yet</span>}</Fact>
        <Fact label="Students"><Enrollment students={classroom.student_count} capacity={classroom.capacity} /></Fact>
        <Fact label="Teachers">{classroom.teaching_staff_count ? <span className="tabular-nums">{classroom.teaching_staff_count}</span> : <span className="text-ink-subtle">None yet</span>}</Fact>
        <Fact label="Robot">{classroom.allocated_robot?.name ?? <span className="text-ink-subtle">Not assigned</span>}</Fact>
      </dl>
    </header>

    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0"><ClassroomMembersSection organizationId={scope.organizationId} classroomId={classroom.id} classroomName={classroom.name} token={scope.token} /></div>
      <aside aria-label="Robot and quizzes" className="grid min-w-0 gap-5 md:grid-cols-2 lg:grid-cols-1">
        <ClassroomRobotAllocation organizationId={scope.organizationId} classroomId={classroom.id} token={scope.token} currentRobot={classroom.allocated_robot} />
        <section aria-labelledby="classroom-quizzes" className="rounded-[10px] border border-line bg-surface p-5">
          <h2 id="classroom-quizzes" className="text-base font-semibold text-ink">Quizzes</h2>
          <p className="mt-1 text-sm text-ink-muted">Schedule quizzes from the question bank.</p>
          <Link to={`/school/quizzes?classroomId=${classroom.id}`} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken">Open quizzes</Link>
        </section>
      </aside>
    </div>

    <ClassroomFormDialog open={editOpen} mode="edit" scope={scope} classroom={classroom} pending={mutations.update.isPending} onSubmit={save} onClose={() => setEditOpen(false)} />
    <ReassignOfferingDialog open={offeringOpen} scope={scope} classroom={classroom} onClose={() => setOfferingOpen(false)} />
    <ClassroomLifecycleDialog action={action} classroom={lifecycleOpen ? classroom : null} pending={mutations.archive.isPending || mutations.reactivate.isPending} onConfirm={confirmLifecycle} onClose={() => setLifecycleOpen(false)} />
  </>);
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0 sm:max-w-[22rem]' : 'min-w-0'}>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Enrollment against capacity. The bar is drawn only when the API returns a capacity; it repeats the text, so it is
 *  hidden from assistive tech. Mango marks a classroom at 90% or more, and "Full" says it in words. */
function Enrollment({ students, capacity }: { students: number; capacity: number | null | undefined }) {
  if (!capacity) return <span className="tabular-nums">{students}</span>;
  const ratio = Math.min(students / capacity, 1);
  const full = students >= capacity;
  return (
    <span className="flex items-center gap-2.5">
      <span className="tabular-nums">{students} of {capacity}{full && <span className="font-normal text-ink-muted"> · Full</span>}</span>
      <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
        <span className={`block h-full rounded-full ${ratio >= 0.9 ? 'bg-[rgb(var(--vista-mango))]' : 'bg-accent'}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading classroom…" className="mt-4 animate-pulse">
      <div className="h-5 w-32 rounded bg-sunken" /><div className="mt-3 h-7 w-72 max-w-full rounded bg-sunken" />
      <div className="mt-5 h-12 rounded-[10px] bg-sunken" /><div className="mt-6 grid gap-5 lg:grid-cols-[2fr_1fr]"><div className="h-64 rounded-[10px] bg-sunken" /><div className="h-64 rounded-[10px] bg-sunken" /></div>
    </div>
  );
}
