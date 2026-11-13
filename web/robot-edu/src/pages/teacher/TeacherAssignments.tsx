import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheckIcon, EyeIcon, FilterIcon, InboxIcon, PencilIcon, PlusIcon, SearchIcon, SendIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ActionMenu, type ActionMenuItem } from '../../components/ui/ActionMenu';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { inputClasses } from '../../components/ui/Field';
import { LinkButton } from '../../components/ui/LinkButton';
import { Pagination } from '../../components/ui/Pagination';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { assignmentApi, instructorApi } from '../../lib/api';
import {
  assignmentSortOptions, buildAssignmentRows, canEditAssignment, canPublishAssignment, canViewSubmissions, emptyFilters, filterAssignmentRows, paginate,
  sortAssignmentRows, statusPresentation, unique, type AssignmentFilters, type AssignmentRow, type AssignmentSortKey, type AssignmentStatusFilter,
} from '../../queries/teacherAssignmentsModel';
import { teacherLearningInvalidations, teacherLearningKeys } from '../../queries/teacherLearningQueries';

const count = (value: number | null) => (value === null ? '—' : String(value));
const formatDue = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const selectClass = `${inputClasses} h-9 py-0`;

export function TeacherAssignments() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText, 250);
  const [filters, setFilters] = useState<AssignmentFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<AssignmentSortKey>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toPublish, setToPublish] = useState<AssignmentRow | null>(null);

  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const rooms = classrooms.data ?? [];
  const assignmentQueries = useQueries({ queries: rooms.map((room) => ({ queryKey: teacherLearningKeys.assignments(room.id), queryFn: () => assignmentApi.list(room.id, token), enabled: Boolean(token) })) });
  const submissionQueries = useQueries({ queries: rooms.map((room) => ({ queryKey: teacherLearningKeys.submissions(room.id), queryFn: () => instructorApi.submissions(room.id, token), enabled: Boolean(token), retry: false })) });
  const optionQueries = useQueries({ queries: rooms.map((room) => ({ queryKey: teacherLearningKeys.deliveryOptions(room.id), queryFn: () => assignmentApi.deliveryOptions(room.id, token), enabled: Boolean(token), retry: false })) });

  const rows = useMemo(() => buildAssignmentRows(rooms.map((room, index) => ({
    classroom: room,
    assignments: assignmentQueries[index]?.data ?? [],
    submissions: submissionQueries[index]?.data,
    courseByLesson: Object.fromEntries((optionQueries[index]?.data ?? []).map((option) => [option.lesson_id, option.course_title])),
  }))), [rooms, assignmentQueries, submissionQueries, optionQueries]);

  const loading = classrooms.isLoading || assignmentQueries.some((query) => query.isLoading);
  const loadError = classrooms.error ?? assignmentQueries.find((query) => query.error)?.error ?? null;
  const publish = useMutation({
    mutationFn: (row: AssignmentRow) => assignmentApi.publish(row.classroomId, row.assignmentId, token),
    onSettled: () => setToPublish(null),
    onSuccess: async (_result, row) => { await Promise.all(teacherLearningInvalidations(row.classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey }))); await queryClient.invalidateQueries({ queryKey: teacherLearningKeys.teachingClassrooms }); },
  });

  useEffect(() => { setFilters((current) => ({ ...current, search })); setPage(1); }, [search]);
  const patchFilters = (patch: Partial<AssignmentFilters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };

  const filtered = useMemo(() => sortAssignmentRows(filterAssignmentRows(rows, filters), sort), [rows, filters, sort]);
  const view = paginate(filtered, page, pageSize);
  const courses = unique(rows.map((row) => row.courseTitle));
  const lessons = unique(rows.filter((row) => !filters.course || row.courseTitle === filters.course).map((row) => `${row.lessonId}\u0000${row.lessonTitle}`)).map((entry) => { const [id, title] = entry.split('\u0000'); return { id, title }; });
  const activeFilterCount = [filters.classroomId, filters.course, filters.lessonId, filters.status !== 'all' ? filters.status : ''].filter(Boolean).length;
  const clearAll = () => { setSearchText(''); setFilters(emptyFilters); setPage(1); };

  const menuItems = (row: AssignmentRow): ActionMenuItem[] => [
    { kind: 'link', label: 'View details', to: `/teacher/assignments/${row.classroomId}/${row.assignmentId}`, icon: <EyeIcon className="h-4 w-4" aria-hidden /> },
    ...(canEditAssignment(row.status) ? [{ kind: 'link' as const, label: 'Edit draft', to: `/teacher/assignments/${row.classroomId}/${row.assignmentId}/edit`, icon: <PencilIcon className="h-4 w-4" aria-hidden /> }] : []),
    ...(canPublishAssignment(row.status) ? [{ kind: 'button' as const, label: 'Publish draft', onSelect: () => setToPublish(row), icon: <SendIcon className="h-4 w-4" aria-hidden /> }] : []),
    ...(canViewSubmissions(row.status) ? [{ kind: 'link' as const, label: 'View submissions', to: `/teacher/submissions?classroomId=${row.classroomId}&assignmentId=${row.assignmentId}`, icon: <InboxIcon className="h-4 w-4" aria-hidden /> }] : []),
  ];

  const countsUnavailable = submissionQueries.some((query) => query.isError);
  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Assignments</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">Manage classroom assignments and student submissions.</p>
      </header>

      <section aria-label="Assignment list" className="mt-6 rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Assignment list</h2>
            <p className="text-[13px] text-ink-muted" aria-live="polite">Total assignments <strong className="text-ink">{rows.length}</strong>{filtered.length !== rows.length && <> · {filtered.length} shown</>}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 lg:w-[260px] lg:flex-none">
              <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" aria-hidden />
              <input type="search" aria-label="Search assignments" placeholder="Search assignments…" value={searchText} onChange={(event) => setSearchText(event.target.value)} className={`${inputClasses} h-9 pl-9`} />
            </div>
            <label className="sr-only" htmlFor="assignment-sort">Sort assignments</label>
            <select id="assignment-sort" value={sort} onChange={(event) => { setSort(event.target.value as AssignmentSortKey); setPage(1); }} className={`${selectClass} !w-auto`}>
              {assignmentSortOptions.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
            </select>
            <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="assignment-filters" onClick={() => setFiltersOpen((value) => !value)} icon={<FilterIcon className="h-4 w-4" aria-hidden />}>
              Filter{activeFilterCount > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white">{activeFilterCount}</span>}
            </Button>
            <LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" aria-hidden />}>Create New</LinkButton>
          </div>
        </div>

        {filtersOpen && (
          <div id="assignment-filters" className="grid gap-3 border-t border-line bg-sunken/50 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[13px] font-medium text-ink">Classroom
              <select className={`${selectClass} mt-1`} value={filters.classroomId} onChange={(event) => patchFilters({ classroomId: event.target.value })}><option value="">All classrooms</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
            <label className="text-[13px] font-medium text-ink">Course
              <select className={`${selectClass} mt-1`} value={filters.course} onChange={(event) => patchFilters({ course: event.target.value, lessonId: '' })}><option value="">All courses</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
            <label className="text-[13px] font-medium text-ink">Lesson
              <select className={`${selectClass} mt-1`} value={filters.lessonId} onChange={(event) => patchFilters({ lessonId: event.target.value })}><option value="">All lessons</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
            <label className="text-[13px] font-medium text-ink">Status
              <select className={`${selectClass} mt-1`} value={filters.status} onChange={(event) => patchFilters({ status: event.target.value as AssignmentStatusFilter })}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></label>
            <div className="flex items-end"><Button variant="ghost" onClick={clearAll}>Clear filters</Button></div>
          </div>
        )}

        {notice && <p role="status" className="mx-4 mb-4 border-l-4 border-ok bg-ok-soft p-3 text-sm text-ok">{notice}</p>}
        {loadError && <p role="alert" className="mx-4 mb-4 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{loadError instanceof Error ? loadError.message : 'Assignments could not be loaded.'} <button type="button" className="ml-2 font-semibold underline" onClick={() => { void classrooms.refetch(); assignmentQueries.forEach((query) => void query.refetch()); }}>Retry</button></p>}
        {publish.error && <p role="alert" className="mx-4 mb-4 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{publish.error instanceof Error ? publish.error.message : 'The assignment could not be published.'}</p>}
        {countsUnavailable && <p role="status" className="mx-4 mb-4 text-xs text-ink-muted">Submission counts could not be loaded for some classrooms and are shown as “—”.</p>}

        <div className="relative overflow-x-auto border-t border-line">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-sunken/60 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Assignment</th>
                <th scope="col" className="px-3 py-3 font-medium">Course / Lesson</th>
                <th scope="col" className="px-3 py-3 font-medium">Classroom</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" title="Active students enrolled in the classroom" className="px-3 py-3 text-right font-medium">Enrolled</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Submitted</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Assessed</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Needs review</th>
                <th scope="col" className="px-3 py-3 font-medium">Due</th>
                <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden><td colSpan={10} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-sunken" /></td></tr>)}
              {!loading && view.items.map((row) => {
                const status = statusPresentation(row.status);
                return (
                  <tr key={row.key} className="hover:bg-sunken/40">
                    <td className="max-w-[260px] px-4 py-3.5"><p className="truncate font-medium text-ink">{row.title}</p>{row.challengeTitle && <p className="mt-0.5 truncate text-xs text-ink-subtle">{row.challengeTitle}</p>}</td>
                    <td className="max-w-[220px] px-3 py-3.5 text-ink-muted"><p className="truncate">{row.courseTitle || '—'}</p><p className="truncate text-xs text-ink-subtle">{row.lessonTitle || '—'}</p></td>
                    <td className="px-3 py-3.5 text-ink-muted">{row.classroomName}</td>
                    <td className="px-3 py-3.5"><Badge tone={status.tone} dot>{status.label}</Badge></td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-ink-muted">{row.status === 'draft' ? '—' : row.assignedStudents}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-ink-muted">{row.status === 'draft' ? '—' : count(row.submitted)}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-ink-muted">{row.status === 'draft' ? '—' : count(row.assessed)}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{row.status !== 'draft' && row.needsReview ? <Badge tone="warn">{row.needsReview}</Badge> : <span className="text-ink-muted">{row.status === 'draft' ? '—' : count(row.needsReview)}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-ink-muted">{formatDue(row.dueAt)}</td>
                    <td className="px-4 py-3.5 text-right"><ActionMenu label={`Actions for ${row.title}`} items={menuItems(row)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && !loadError && rows.length === 0 && <EmptyState icon={<ClipboardCheckIcon />} title="No assignments yet" description="Create a draft for one of your teaching classrooms. Students only see it after you publish." action={<LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" aria-hidden />}>Create New</LinkButton>} />}
        {!loading && rows.length > 0 && filtered.length === 0 && <EmptyState compact icon={<SearchIcon />} title="No assignments match" description="Try a different search or clear the filters." action={<Button variant="secondary" onClick={clearAll}>Clear search and filters</Button>} />}
        <Pagination {...view} pageSize={pageSize} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      <ConfirmDialog
        open={Boolean(toPublish)} tone="primary" title="Publish this assignment?"
        description={toPublish ? `“${toPublish.title}” will become visible to the ${toPublish.assignedStudents} enrolled student${toPublish.assignedStudents === 1 ? '' : 's'} of ${toPublish.classroomName}. Students in other classrooms will not see it.` : ''}
        confirmLabel={publish.isPending ? 'Publishing…' : 'Publish'}
        onCancel={() => { if (!publish.isPending) setToPublish(null); }}
        onConfirm={() => { if (toPublish && !publish.isPending) publish.mutate(toPublish); }} />
    </main>
  );
}
