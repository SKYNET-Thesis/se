import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUpIcon, PlusIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { educationAdminApi } from '../../lib/api';
import { classroomStudentImportInvalidations, memberInvalidations, schoolAdminKeys } from '../../queries/schoolAdminQueries';
import { ClassroomStudentImport } from './ClassroomStudentImport.tsx';
import { MemberCandidatePicker } from './MemberCandidatePicker';
import { candidateMutationBody, candidatePageCount, candidateSearchChange, useDebouncedValue } from './memberCandidateState';

const PAGE_SIZE = 20;

/**
 * Classroom members, add member and student import (A02). Moved from SchoolManagement for the classroom detail route;
 * queries, mutations, invalidations and copy are unchanged. Remove still uses the browser confirm as before.
 */
export function ClassroomMembersSection({ organizationId, classroomId, classroomName, token }: { organizationId: string; classroomId: string; classroomName: string; token: string }) {
  const queryClient = useQueryClient();
  const [memberOpen, setMemberOpen] = useState(false); const [studentImportOpen, setStudentImportOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState(''); const [candidatePage, setCandidatePage] = useState(1); const [selectedMemberId, setSelectedMemberId] = useState(''); const [error, setError] = useState<string | null>(null);
  const candidateTerm = useDebouncedValue(candidateSearch.trim(), 300);
  const active = Boolean(organizationId && classroomId);

  const roster = useQuery({ queryKey: schoolAdminKeys.members(organizationId, classroomId), queryFn: () => educationAdminApi.classroomMembers(organizationId, classroomId, token), enabled: active });
  const candidates = useQuery({ queryKey: schoolAdminKeys.candidates(organizationId, classroomId, { page: candidatePage, pageSize: PAGE_SIZE, search: candidateTerm }), queryFn: () => educationAdminApi.memberCandidates(organizationId, classroomId, token, { page: candidatePage, pageSize: PAGE_SIZE, search: candidateTerm || undefined }), enabled: active && memberOpen });
  useEffect(() => { if (candidates.data) { const pages = candidatePageCount(candidates.data.total, PAGE_SIZE); if (candidatePage > pages) setCandidatePage(pages); } }, [candidatePage, candidates.data]);

  const addMember = useMutation({ mutationFn: (userId: string) => educationAdminApi.upsertMember(organizationId, classroomId, token, candidateMutationBody(userId)), onSuccess: async () => { setMemberOpen(false); setSelectedMemberId(''); await Promise.all(memberInvalidations(organizationId, classroomId).map(queryKey => queryClient.invalidateQueries({ queryKey }))); }, onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to add classroom member.') });
  const removeStudent = useMutation({ mutationFn: (studentId: string) => educationAdminApi.revokeMember(organizationId, classroomId, studentId, token), onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: schoolAdminKeys.classrooms(organizationId) }); }, onError: (cause) => setError(cause instanceof Error ? cause.message : 'The student could not be removed.') });

  const openMemberDialog = () => { setCandidateSearch(''); setCandidatePage(1); setSelectedMemberId(''); setMemberOpen(true); };
  const submitMember = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (selectedMemberId) addMember.mutate(selectedMemberId); };
  const refreshAfterStudentImport = async () => { await Promise.all(classroomStudentImportInvalidations(organizationId, classroomId).map(queryKey => queryClient.invalidateQueries({ queryKey }))); };
  const onRemoveStudent = (studentId: string, name: string) => { if (window.confirm(`Remove ${name} from ${classroomName}? Their progress and results are kept.`)) removeStudent.mutate(studentId); };
  const visibleError = error ?? (roster.error instanceof Error ? roster.error.message : candidates.error instanceof Error ? candidates.error.message : null);

  return <>
    {visibleError && <p role="alert" className="mb-3 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{visibleError}</p>}
    <MembersPanel roster={roster.data ?? []} loading={roster.isPending && active} onAdd={openMemberDialog} onImport={() => setStudentImportOpen(true)} onRemoveStudent={onRemoveStudent} />
    <Dialog open={memberOpen} onClose={() => setMemberOpen(false)} title="Add classroom member" description="Select an eligible school member. Their classroom role is derived automatically." footer={<><Button variant="secondary" onClick={() => setMemberOpen(false)}>Cancel</Button><Button type="submit" form="add-classroom-member" loading={addMember.isPending} disabled={!selectedMemberId}>Add member</Button></>}><form id="add-classroom-member" onSubmit={submitMember} className="space-y-4"><label className="block text-sm font-medium text-ink">Search eligible members<input value={candidateSearch} onChange={event => { const next = candidateSearchChange(event.target.value); setCandidateSearch(next.searchInput); setCandidatePage(next.page); setSelectedMemberId(next.selectedUserId); }} placeholder="Search name or school code" className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" /></label><MemberCandidatePicker candidates={candidates.data?.items ?? []} total={candidates.data?.total ?? 0} page={candidatePage} pageSize={PAGE_SIZE} selectedUserId={selectedMemberId} loading={candidateSearch.trim() !== candidateTerm || candidates.isPending || candidates.isFetching} onSelect={setSelectedMemberId} onPage={page => { setCandidatePage(page); setSelectedMemberId(''); }} /></form></Dialog>
    <ClassroomStudentImport open={studentImportOpen} onClose={() => setStudentImportOpen(false)} organizationId={organizationId} classroomId={classroomId} token={token} onPersisted={refreshAfterStudentImport} />
  </>;
}

function TableSkeleton(){return <div aria-label="Loading school data" className="space-y-3 animate-pulse">{[1,2,3,4].map(item=><div key={item} className="h-12 rounded bg-sunken"/>)}</div>;}
function MembersPanel({roster,loading,onAdd,onImport,onRemoveStudent}:{roster:Record<string,unknown>[];loading:boolean;onAdd:()=>void;onImport:()=>void;onRemoveStudent:(studentId:string,name:string)=>void}){
  const students=roster.filter(member=>member.classroom_role==='student');const staff=roster.filter(member=>member.classroom_role!=='student');
  return <section aria-labelledby="classroom-members" className="rounded-[10px] border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <h2 id="classroom-members" className="text-base font-semibold text-ink">Members</h2>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onAdd} icon={<PlusIcon className="h-4 w-4" aria-hidden/>}>Add member</Button><Button size="sm" variant="secondary" onClick={onImport} icon={<FileUpIcon className="h-4 w-4" aria-hidden/>}>Import students</Button></div>
    </div>
    <div className="px-5 pb-5 pt-4">
      {loading?<TableSkeleton/>:roster.length===0?<p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">No members yet. Add teachers and students, or import a class list.</p>:<div className="space-y-5"><MemberGroup title="Students" members={students} onRemove={onRemoveStudent}/><MemberGroup title="Teachers" members={staff}/></div>}
    </div>
  </section>;
}
function MemberGroup({title,members,onRemove}:{title:string;members:Record<string,unknown>[];onRemove?:(studentId:string,name:string)=>void}){
  return <div>
    <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-ink">{title}<span className="font-normal tabular-nums text-ink-muted">{members.length}</span></h3>
    {members.length?<ul className="divide-y divide-line rounded-md border border-line">{members.map(member=><li key={String(member.id)} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
      <p className="min-w-0 truncate text-sm font-medium text-ink">{String(member.full_name??'School member')}</p>
      {onRemove&&<button type="button" className="-mr-1 shrink-0 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:text-danger" aria-label={`Remove ${String(member.full_name??'student')}`} onClick={()=>onRemove(String(member.user_id),String(member.full_name??'this student'))}>Remove</button>}
    </li>)}</ul>:<p className="text-sm text-ink-muted">No {title.toLowerCase()} yet.</p>}
  </div>;
}
