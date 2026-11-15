import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUpIcon, PlusIcon, RotateCwIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RemoveStudentDialog } from '../../components/school/RemoveStudentDialog';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { inputClasses } from '../../components/ui/Field';
import { Pagination } from '../../components/ui/Pagination';
import { educationAdminApi } from '../../lib/api';
import { paginate } from '../../queries/teacherAssignmentsModel';
import { classroomStudentImportInvalidations, memberInvalidations, schoolAdminKeys } from '../../queries/schoolAdminQueries';
import { cn } from '../../utils/cn';
import { ClassroomStudentImport } from './ClassroomStudentImport.tsx';
import { MemberCandidatePicker } from './MemberCandidatePicker';
import { MEMBER_ROLE_FILTERS, canRemove, filterMembers, joinedLabel, memberCounts, roleLabel, toClassroomMember, type ClassroomMember, type MemberRoleFilter } from './classroomMembersModel';
import { candidateMutationBody, candidatePageCount, candidateSearchChange, useDebouncedValue } from './memberCandidateState';

const CANDIDATE_PAGE_SIZE = 20;

/**
 * Classroom members (A02): roster with search, role filter and paging, Add member, Remove student and CSV import.
 * Endpoints, request bodies and permissions are unchanged; every list refresh follows a confirmed server response.
 */
export function ClassroomMembersSection({ organizationId, classroomId, classroomName, token }: { organizationId: string; classroomId: string; classroomName: string; token: string }) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const active = Boolean(organizationId && classroomId);

  // Roster ---------------------------------------------------------------------------------------------------------
  const roster = useQuery({ queryKey: schoolAdminKeys.members(organizationId, classroomId), queryFn: () => educationAdminApi.classroomMembers(organizationId, classroomId, token), enabled: active });
  const members = useMemo(() => (roster.data ?? []).map(toClassroomMember), [roster.data]);
  const [search, setSearch] = useState(''); const [role, setRole] = useState<MemberRoleFilter>('all');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  const counts = memberCounts(members);
  const filtered = useMemo(() => filterMembers(members, { search, role }), [members, search, role]);
  const paged = paginate(filtered, page, pageSize);
  useEffect(() => { if (page > paged.pageCount) setPage(paged.pageCount); }, [page, paged.pageCount]);
  const refreshMembers = () => Promise.all(memberInvalidations(organizationId, classroomId).map(queryKey => queryClient.invalidateQueries({ queryKey })));

  // Add member -----------------------------------------------------------------------------------------------------
  const [memberOpen, setMemberOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState(''); const [candidatePage, setCandidatePage] = useState(1); const [selectedMemberId, setSelectedMemberId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const candidateTerm = useDebouncedValue(candidateSearch.trim(), 300);
  const candidates = useQuery({ queryKey: schoolAdminKeys.candidates(organizationId, classroomId, { page: candidatePage, pageSize: CANDIDATE_PAGE_SIZE, search: candidateTerm }), queryFn: () => educationAdminApi.memberCandidates(organizationId, classroomId, token, { page: candidatePage, pageSize: CANDIDATE_PAGE_SIZE, search: candidateTerm || undefined }), enabled: active && memberOpen });
  useEffect(() => { if (candidates.data) { const pages = candidatePageCount(candidates.data.total, CANDIDATE_PAGE_SIZE); if (candidatePage > pages) setCandidatePage(pages); } }, [candidatePage, candidates.data]);
  const addMember = useMutation({ mutationFn: (userId: string) => educationAdminApi.upsertMember(organizationId, classroomId, token, candidateMutationBody(userId)) });
  const selectedCandidate = candidates.data?.items.find(item => item.userId === selectedMemberId);
  const openMemberDialog = () => { setCandidateSearch(''); setCandidatePage(1); setSelectedMemberId(''); setAddError(null); setMemberOpen(true); };
  const closeMemberDialog = () => { if (!addMember.isPending) setMemberOpen(false); };
  const submitMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMemberId || addMember.isPending) return;
    setAddError(null);
    const name = selectedCandidate?.displayName;
    try {
      await addMember.mutateAsync(selectedMemberId);
      setMemberOpen(false); setSelectedMemberId('');
      await refreshMembers();
      toast.success(name ? `${name} added to ${classroomName}` : `Member added to ${classroomName}`);
    } catch (cause) {
      setAddError(cause instanceof Error ? cause.message : 'This person couldn’t be added. Try again.');
      window.setTimeout(() => document.getElementById('add-classroom-member-submit')?.focus(), 0); // re-enabled after pending
    }
  };

  // Remove student -------------------------------------------------------------------------------------------------
  const [removing, setRemoving] = useState<ClassroomMember | null>(null);
  const removeStudent = useMutation({ mutationFn: (studentId: string) => educationAdminApi.revokeMember(organizationId, classroomId, studentId, token) });
  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    await removeStudent.mutateAsync(target.userId); // throws into the dialog, which stays open with the message
    setRemoving(null);
    await refreshMembers();
    toast.success(`${target.name} removed from ${classroomName}`);
    window.setTimeout(() => headingRef.current?.focus(), 0); // the row and its button are gone
  };

  // Import -----------------------------------------------------------------------------------------------------------
  const [importOpen, setImportOpen] = useState(false);
  const refreshAfterImport = async () => { await Promise.all(classroomStudentImportInvalidations(organizationId, classroomId).map(queryKey => queryClient.invalidateQueries({ queryKey }))); };

  const filtersActive = Boolean(search.trim()) || role !== 'all';
  return <>
    <section aria-labelledby="classroom-members" className="rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="classroom-members" ref={headingRef} tabIndex={-1} className="flex items-baseline gap-2 text-base font-semibold text-ink focus-visible:outline-none">
          Members{roster.isSuccess && <span className="text-sm font-normal tabular-nums text-ink-muted">{counts.all}</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={openMemberDialog} icon={<PlusIcon className="h-4 w-4" aria-hidden />}>Add member</Button>
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} icon={<FileUpIcon className="h-4 w-4" aria-hidden />}>Import students</Button>
        </div>
      </div>

      {roster.isError ? (
        <div role="alert" className="m-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
          <span>{roster.error instanceof Error ? roster.error.message : 'Members couldn’t be loaded.'}</span>
          <Button size="sm" variant="secondary" onClick={() => void roster.refetch()} loading={roster.isFetching} icon={<RotateCwIcon className="h-4 w-4" aria-hidden />}>Try again</Button>
        </div>
      ) : roster.isPending && active ? <RosterSkeleton /> : members.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-ink">No members yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">Add teachers and students one at a time, or import a class list from a CSV file.</p>
        </div>
      ) : <>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" aria-hidden />
            <input type="search" aria-label="Search members" placeholder="Search name or email…" value={search} autoComplete="off" spellCheck={false}
              onChange={event => { setSearch(event.target.value); setPage(1); }} className={`${inputClasses} h-9 pl-9`} />
          </div>
          <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-1">
            {MEMBER_ROLE_FILTERS.map(item => (
              <button key={item.value} type="button" aria-pressed={role === item.value} onClick={() => { setRole(item.value); setPage(1); }}
                className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors duration-150', role === item.value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink')}>
                {item.label}<span className="text-xs tabular-nums opacity-80">{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <p aria-live="polite" className="text-sm text-ink-muted sm:ml-auto">{roster.isFetching ? 'Refreshing…' : filtersActive ? `${filtered.length} of ${members.length}` : ''}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-muted">
            <p>{search.trim() ? <>No members match “{search.trim()}”{role !== 'all' ? ` among ${role === 'student' ? 'students' : 'teachers'}` : ''}.</> : role === 'student' ? 'No students in this classroom yet.' : 'No teachers in this classroom yet.'}</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => { setSearch(''); setRole('all'); setPage(1); }}>Clear filters</Button>
          </div>
        ) : <>
          <MemberTable members={paged.items} onRemove={setRemoving} />
          <MemberList members={paged.items} onRemove={setRemoving} />
          {filtered.length > 10 && <Pagination page={paged.page} pageCount={paged.pageCount} total={filtered.length} from={paged.from} to={paged.to} pageSize={pageSize} noun="members"
            onPage={setPage} onPageSize={size => { setPageSize(size); setPage(1); }} />}
        </>}
      </>}
    </section>

    <Dialog open={memberOpen} onClose={closeMemberDialog} className="vista-school" title="Add member" description={<>Teachers and students from your school who aren’t in <span className="font-medium text-ink">{classroomName}</span> yet.</>}
      footer={<><Button variant="secondary" onClick={closeMemberDialog} disabled={addMember.isPending}>Cancel</Button><Button id="add-classroom-member-submit" type="submit" variant="primary" form="add-classroom-member" loading={addMember.isPending} disabled={!selectedMemberId}>{addMember.isPending ? 'Adding…' : 'Add member'}</Button></>}>
      <form id="add-classroom-member" onSubmit={event => void submitMember(event)} className="space-y-4">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink">Search</span>
          <span className="relative mt-1.5 block">
            <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-subtle" aria-hidden />
            <input type="search" value={candidateSearch} autoComplete="off" spellCheck={false} placeholder="Name, email or school code…"
              onChange={event => { const next = candidateSearchChange(event.target.value); setCandidateSearch(next.searchInput); setCandidatePage(next.page); setSelectedMemberId(next.selectedUserId); setAddError(null); }}
              className={`${inputClasses} h-10 pl-9`} />
          </span>
        </label>
        {candidates.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">
            <span>{candidates.error instanceof Error ? candidates.error.message : 'People couldn’t be loaded.'}</span>
            <Button size="sm" variant="secondary" onClick={() => void candidates.refetch()}>Try again</Button>
          </div>
        ) : <MemberCandidatePicker candidates={candidates.data?.items ?? []} total={candidates.data?.total ?? 0} page={candidatePage} pageSize={CANDIDATE_PAGE_SIZE} selectedUserId={selectedMemberId}
          search={candidateTerm} loading={candidateSearch.trim() !== candidateTerm || candidates.isPending}
          onSelect={userId => { setSelectedMemberId(userId); setAddError(null); }} onPage={next => { setCandidatePage(next); setSelectedMemberId(''); }} />}
        {addError && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{addError}</p>}
      </form>
    </Dialog>

    <RemoveStudentDialog student={removing} classroomName={classroomName} pending={removeStudent.isPending} onConfirm={confirmRemove} onClose={() => setRemoving(null)} />
    <ClassroomStudentImport open={importOpen} onClose={() => setImportOpen(false)} organizationId={organizationId} classroomId={classroomId} classroomName={classroomName} token={token} onPersisted={refreshAfterImport} />
  </>;
}

function RemoveButton({ member, onRemove }: { member: ClassroomMember; onRemove: (member: ClassroomMember) => void }) {
  return <button type="button" onClick={() => onRemove(member)} aria-label={`Remove ${member.name}`}
    className="inline-flex h-9 shrink-0 items-center rounded-md px-2.5 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:text-danger">Remove</button>;
}

/** sm and up: one row per member with email under the name so long addresses never widen the table. */
function MemberTable({ members, onRemove }: { members: ClassroomMember[]; onRemove: (member: ClassroomMember) => void }) {
  return <table className="hidden w-full table-fixed text-left text-sm sm:table">
    <thead className="text-xs text-ink-muted"><tr className="border-b border-line">
      <th scope="col" className="px-5 py-2 font-medium">Name</th>
      <th scope="col" className="w-28 px-3 py-2 font-medium">Role</th>
      <th scope="col" className="w-32 px-3 py-2 font-medium">Joined</th>
      <th scope="col" className="w-24 px-5 py-2"><span className="sr-only">Actions</span></th>
    </tr></thead>
    <tbody className="divide-y divide-line">{members.map(member => <tr key={member.id}>
      <td className="min-w-0 px-5 py-2.5">
        <span className="block truncate font-medium text-ink" title={member.name}>{member.name}</span>
        {member.email && <span className="block truncate text-xs text-ink-muted" title={member.email}>{member.email}</span>}
      </td>
      <td className="px-3 py-2.5"><Badge tone={member.role === 'teacher' ? 'accent' : 'neutral'}>{roleLabel(member.role)}</Badge></td>
      <td className="px-3 py-2.5 tabular-nums text-ink-muted">{joinedLabel(member.joinedAt) ?? '—'}</td>
      <td className="px-5 py-1.5 text-right">{canRemove(member) && <RemoveButton member={member} onRemove={onRemove} />}</td>
    </tr>)}</tbody>
  </table>;
}

/** Below sm: stacked rows; names and emails wrap instead of truncating so nothing is hidden on a phone. */
function MemberList({ members, onRemove }: { members: ClassroomMember[]; onRemove: (member: ClassroomMember) => void }) {
  return <ul className="divide-y divide-line sm:hidden">{members.map(member => <li key={member.id} className="flex items-start justify-between gap-3 px-5 py-3">
    <div className="min-w-0">
      <p className="font-medium text-ink [overflow-wrap:anywhere]">{member.name}</p>
      {member.email && <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">{member.email}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted"><Badge tone={member.role === 'teacher' ? 'accent' : 'neutral'}>{roleLabel(member.role)}</Badge>{joinedLabel(member.joinedAt) && <span>Joined {joinedLabel(member.joinedAt)}</span>}</p>
    </div>
    {canRemove(member) && <RemoveButton member={member} onRemove={onRemove} />}
  </li>)}</ul>;
}

function RosterSkeleton() {
  return <div role="status" aria-label="Loading members…" className="space-y-3 p-5 animate-pulse">{[1, 2, 3, 4].map(item => <div key={item} className="h-10 rounded bg-sunken" />)}</div>;
}
