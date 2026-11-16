import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCapIcon, PlusIcon, RotateCwIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ClassroomCodeTag, ClassroomStatusBadge } from '../../components/school/ClassroomBadges';
import { ClassroomFormDialog } from '../../components/school/ClassroomFormDialog';
import { ClassroomLifecycleDialog } from '../../components/school/ClassroomLifecycleDialog';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { inputClasses } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import type { ApiSchoolClassroom } from '../../lib/api';
import { lifecycleOutcome } from '../../queries/classroomLifecycleModel';
import { STATUS_FILTERS, classroomPath, enrollmentLabel, filterClassrooms, lifecycleAction, parseStatusFilter, statusCounts, type ClassroomStatusFilter } from '../../queries/classroomsModel';
import { useClassroomMutations, useSchoolClassrooms, useSchoolScope } from '../../queries/schoolClassrooms';
import { paginate } from '../../queries/teacherAssignmentsModel';
import { cn } from '../../utils/cn';


/** A01 Classroom List: find a classroom, see its state at a glance, and act on it. Search, status and page live in the URL. */
export function ClassroomsPage() {
  const scope = useSchoolScope();
  const classrooms = useSchoolClassrooms(scope);
  const mutations = useClassroomMutations(scope);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = parseStatusFilter(params.get('status'));
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSchoolClassroom | null>(null);
  const [lifecycle, setLifecycle] = useState<ApiSchoolClassroom | null>(null);

  const setParam = (updates: Record<string, string | null>) => setParams((current) => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
    return next;
  }, { replace: true });

  const all = useMemo(() => classrooms.data ?? [], [classrooms.data]);
  const counts = useMemo(() => statusCounts(all), [all]);
  const filtered = useMemo(() => filterClassrooms(all, { search, status }), [all, search, status]);
  const page = paginate(filtered, Number(params.get('page') ?? '1') || 1, pageSize);
  const filtersActive = Boolean(search.trim()) || status !== 'all';
  const loading = scope.resolving || (Boolean(scope.organizationId) && classrooms.isPending);
  const lifecycleKind = lifecycle ? lifecycleAction(lifecycle) : 'archive';

  const create = async (values: Parameters<typeof mutations.create.mutateAsync>[0]) => {
    const created = await mutations.create.mutateAsync(values);
    setCreateOpen(false); toast.success('Classroom created', { description: values.name.trim() });
    navigate(classroomPath(created.id));
  };
  const save = async (values: Parameters<typeof mutations.create.mutateAsync>[0]) => {
    if (!editing) return;
    await mutations.update.mutateAsync({ classroomId: editing.id, values });
    setEditing(null); toast.success('Classroom saved');
  };
  const confirmLifecycle = async () => {
    if (!lifecycle) return;
    const response = lifecycleKind === 'archive' ? await mutations.archive.mutateAsync(lifecycle.id) : await mutations.reactivate.mutateAsync(lifecycle.id);
    const outcome = lifecycleOutcome(lifecycleKind, response, lifecycle);
    toast.success(outcome.title, { description: outcome.description });
    setLifecycle(null);
  };

  return (
    <div className="vista-school mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Classrooms" description="Find a classroom to manage its students, course and robot."
        actions={<Button variant="primary" onClick={() => setCreateOpen(true)} icon={<PlusIcon className="h-4 w-4" aria-hidden />} disabled={!scope.organizationId}>Create classroom</Button>} />

      {!scope.resolving && !scope.organizationId ? (
        <EmptyState className="mt-8" icon={<GraduationCapIcon />} title="No school to manage" description="Your account has no active school administrator membership. Ask a system administrator to grant it." />
      ) : (
        <section aria-labelledby="classroom-list-heading" className="mt-6 rounded-[10px] border border-line bg-surface">
          <h2 id="classroom-list-heading" className="sr-only">Classroom list</h2>
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
            <div className="relative md:w-80">
              <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-subtle" aria-hidden />
              <input type="search" aria-label="Search classrooms" placeholder="Search name, code or course…" value={search} autoComplete="off" spellCheck={false}
                onChange={(event) => setParam({ q: event.target.value || null, page: null })} className={`${inputClasses} h-10 pl-9`} />
            </div>
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
              {STATUS_FILTERS.filter((item) => item.value !== 'completed' || counts.completed > 0).map((item) => (
                <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => setParam({ status: item.value === 'all' ? null : item.value, page: null })}
                  className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors duration-150',
                    status === item.value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink')}>
                  {item.label}{classrooms.isSuccess && <span className="tabular-nums text-xs opacity-80">{counts[item.value as ClassroomStatusFilter]}</span>}
                </button>
              ))}
            </div>
            <p aria-live="polite" className="text-sm text-ink-muted md:ml-auto">{classrooms.isFetching && !loading ? 'Refreshing…' : !loading && filtersActive ? `${filtered.length} of ${all.length} classrooms` : ''}</p>
          </div>

          {classrooms.error && (
            <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
              <span>{classrooms.error instanceof Error ? classrooms.error.message : 'Classrooms could not be loaded.'}</span>
              <Button size="sm" variant="secondary" onClick={() => void classrooms.refetch()} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
            </div>
          )}

          {loading ? <ListSkeleton /> : !classrooms.error && all.length === 0 ? (
            <EmptyState icon={<GraduationCapIcon />} title="No classrooms yet" description="Create a classroom, then add students and teachers and assign a robot."
              action={<Button variant="primary" onClick={() => setCreateOpen(true)} icon={<PlusIcon className="h-4 w-4" aria-hidden />}>Create classroom</Button>} />
          ) : all.length > 0 && filtered.length === 0 ? (
            <EmptyState compact icon={<SearchIcon />} title="No classrooms match" description={search.trim() ? `Nothing matches “${search.trim()}”${status !== 'all' ? ' with this status' : ''}. Check the spelling or try the classroom code.` : 'No classroom has this status.'}
              action={<Button variant="secondary" onClick={() => setParam({ q: null, status: null, page: null })}>Clear filters</Button>} />
          ) : filtered.length > 0 && (
            <>
              <ClassroomTable rows={page.items} onEdit={setEditing} onLifecycle={setLifecycle} />
              <ClassroomStack rows={page.items} />
              <Pagination noun="classrooms" page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} pageSize={pageSize}
                onPage={(next) => setParam({ page: next > 1 ? String(next) : null })} onPageSize={(size) => { setPageSize(size); setParam({ page: null }); }} />
            </>
          )}
        </section>
      )}

      <ClassroomFormDialog open={createOpen} mode="create" scope={scope} pending={mutations.create.isPending} onSubmit={create} onClose={() => setCreateOpen(false)} />
      <ClassroomFormDialog open={Boolean(editing)} mode="edit" scope={scope} classroom={editing} pending={mutations.update.isPending} onSubmit={save} onClose={() => setEditing(null)} />
      <ClassroomLifecycleDialog action={lifecycleKind} classroom={lifecycle} pending={mutations.archive.isPending || mutations.reactivate.isPending} onConfirm={confirmLifecycle} onClose={() => setLifecycle(null)} />
    </div>
  );
}

function ClassroomTable({ rows, onEdit, onLifecycle }: { rows: ApiSchoolClassroom[]; onEdit: (row: ApiSchoolClassroom) => void; onLifecycle: (row: ApiSchoolClassroom) => void }) {
  return (
    <div className="hidden md:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-[13px] text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Classroom</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Course</th>
            <th scope="col" title="Active students, and capacity when set" className="px-3 py-2.5 text-right font-medium">Students</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Teachers</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Robot</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id} className={cn('transition-colors duration-150 hover:bg-sunken/60', row.status === 'archived' && 'text-ink-muted')}>
              <td className="max-w-[280px] px-4 py-3">
                <Link to={classroomPath(row.id)} className="block truncate font-medium text-ink hover:text-accent hover:underline">{row.name}</Link>
                <ClassroomCodeTag code={row.code} className="mt-1" />
                <span className="mt-1 block truncate text-[13px] text-ink-muted lg:hidden">{row.offering_title ?? 'No course yet'}</span>
              </td>
              <td className="hidden max-w-[260px] px-3 py-3 lg:table-cell"><span className="line-clamp-2 break-words">{row.offering_title ?? <span className="text-ink-subtle">No course yet</span>}</span></td>
              <td className="px-3 py-3 text-right tabular-nums">{enrollmentLabel(row)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{row.teaching_staff_count || <span className="text-ink-subtle">None</span>}</td>
              <td className="hidden max-w-[180px] truncate px-3 py-3 lg:table-cell">{row.allocated_robot?.name ?? <span className="text-ink-subtle">Not assigned</span>}</td>
              <td className="px-3 py-3"><ClassroomStatusBadge status={row.status} /></td>
              <td className="px-4 py-3 text-right">
                <ActionMenu label={`Actions for ${row.name}`} items={[
                  { kind: 'link', label: 'Open classroom', to: classroomPath(row.id) },
                  { kind: 'button', label: 'Edit details', onSelect: () => onEdit(row) },
                  lifecycleAction(row) === 'archive'
                    ? { kind: 'button', label: 'Archive classroom', tone: 'danger', onSelect: () => onLifecycle(row) }
                    : { kind: 'button', label: 'Reactivate classroom', onSelect: () => onLifecycle(row) },
                ]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below 768px the table becomes a list of links, so nothing scrolls sideways. Row actions live on the detail page. */
function ClassroomStack({ rows }: { rows: ApiSchoolClassroom[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {rows.map((row) => (
        <li key={row.id}>
          <Link to={classroomPath(row.id)} className="block px-4 py-3.5 hover:bg-sunken/60">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0"><span className="block truncate font-medium text-ink">{row.name}</span><ClassroomCodeTag code={row.code} className="mt-1" /></span>
              <ClassroomStatusBadge status={row.status} />
            </span>
            <span className="mt-2 block text-[13px] text-ink-muted">
              <span className="tabular-nums">{row.capacity ? `${row.student_count} of ${row.capacity}` : row.student_count}</span> {row.student_count === 1 && !row.capacity ? 'student' : 'students'}
              {row.offering_title && <span className="block truncate">{row.offering_title}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading classrooms…" className="divide-y divide-line">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-4 px-4 py-4">
          <div className="w-56 space-y-2"><div className="h-3.5 w-40 rounded bg-sunken" /><div className="h-3 w-20 rounded bg-sunken" /></div>
          <div className="hidden h-3.5 w-48 rounded bg-sunken md:block" /><div className="ml-auto h-5 w-16 rounded bg-sunken" />
        </div>
      ))}
    </div>
  );
}
