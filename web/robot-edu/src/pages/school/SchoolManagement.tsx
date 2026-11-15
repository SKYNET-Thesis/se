import { useDeferredValue, useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { CopyIcon, FileUpIcon, GraduationCapIcon, KeyRoundIcon, SearchIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi, type ApiSchoolPerson } from '../../lib/api';
import { schoolAdminEnabledQueries, schoolAdminKeys, type PeopleFilters, type SchoolTab } from '../../queries/schoolAdminQueries';

const PAGE_SIZE = 20;

/** School overview, people and recovery codes. Classroom management lives on its own routes (A01): /school/classrooms and
 *  /school/classrooms/:classroomId, so the Classrooms tab navigates there like Import users does. */
export function SchoolManagement({ initialTab = 'overview' }: { initialTab?: string }) {
  const [tab, setTab] = useState<SchoolTab>(initialTab as SchoolTab);
  const [peoplePage, setPeoplePage] = useState(1); const [peopleSearch, setPeopleSearch] = useState(''); const [peopleRole, setPeopleRole] = useState<PeopleFilters['role']>('all');
  const [recoveryResult, setRecoveryResult] = useState<{ name: string; studentCode: string; recoveryCode: string; expiresAt: string } | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false); const [recoveryCopyError, setRecoveryCopyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate(); const { session } = useSupabaseSession(); const { memberships } = useRole(); const token = session?.access_token ?? '';
  const organizationId = memberships.find(item => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const peopleTerm = useDeferredValue(peopleSearch.trim());
  const enabled = schoolAdminEnabledQueries({ tab, organizationId });
  const peopleFilters: PeopleFilters = { page: peoplePage, pageSize: PAGE_SIZE, search: peopleTerm, role: peopleRole };

  const overview = useQuery({ queryKey: schoolAdminKeys.overview(organizationId), queryFn: () => educationAdminApi.overview(organizationId, token), enabled: enabled.overview });
  const people = useQuery({ queryKey: schoolAdminKeys.people(organizationId, peopleFilters), queryFn: () => educationAdminApi.people(organizationId, token, { page: peoplePage, pageSize: PAGE_SIZE, search: peopleTerm || undefined, role: peopleRole === 'all' ? undefined : peopleRole }), enabled: enabled.people, placeholderData: keepPreviousData });

  useEffect(() => { setTab(initialTab as SchoolTab); }, [initialTab]);

  const issueRecovery = useMutation({ mutationFn: (person: ApiSchoolPerson) => educationAdminApi.issueStudentPasswordRecovery(organizationId, person.id, token), onSuccess: (issued, person) => { setRecoveryResult({ ...issued, name: person.displayName, studentCode: person.studentCode ?? '—' }); setRecoveryCopied(false); setRecoveryCopyError(null); }, onError: reason => setError(reason instanceof Error ? reason.message : 'Unable to issue a student recovery code.') });

  const selectTab = (next: string) => { if (next === 'import') navigate('/school/import'); else if (next === 'classrooms') navigate('/school/classrooms'); else setTab(next as SchoolTab); };
  const copyRecoveryCode = async () => { if (!recoveryResult) return; setRecoveryCopyError(null); try { await navigator.clipboard.writeText(recoveryResult.recoveryCode); setRecoveryCopied(true); } catch { setRecoveryCopyError('Could not copy the recovery code.'); } };
  const queryError = overview.error ?? people.error;
  const visibleError = error ?? (queryError instanceof Error ? queryError.message : null);

  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10"><PageHeader title="School Administration" description="Organization-scoped users, classrooms, and delivery readiness." />{visibleError && <p role="alert" className="mt-5 rounded-md bg-danger-soft p-3 text-sm text-danger">{visibleError}</p>}<Tabs className="mt-8" label="School administration" value={tab} onChange={selectTab} items={[{ id: 'overview', label: 'Overview' }, { id: 'users', label: 'Users' }, { id: 'classrooms', label: 'Classrooms' }, { id: 'import', label: 'Import users' }]} />
    {tab === 'overview' && (overview.isPending ? <OverviewSkeleton /> : overview.data && <OverviewPanel data={overview.data} onClassrooms={() => navigate('/school/classrooms')} onImport={() => navigate('/school/import')} refreshing={overview.isFetching} />)}
    {tab === 'users' && <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-[-.04em] text-ink">People in your school</h2><p className="mt-1 text-sm text-ink-muted">Organization membership is separate from classroom enrollment.</p></div><Button onClick={() => navigate('/school/import')}><FileUpIcon className="mr-2 h-4 w-4" />Import users</Button></div>
      <div className="mt-6 flex flex-wrap items-center gap-3"><label className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-muted"><SearchIcon className="h-4 w-4" /><span className="sr-only">Search people</span><input value={peopleSearch} onChange={event => { setPeopleSearch(event.target.value); setPeoplePage(1); }} className="w-full bg-transparent outline-none" placeholder="Search name, school code or email" /></label><select value={peopleRole} onChange={event => { setPeopleRole(event.target.value as PeopleFilters['role']); setPeoplePage(1); }} className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm"><option value="all">All roles</option><option value="student">Students</option><option value="instructor">Teachers</option></select>{people.isFetching && !people.isPending && <span className="text-xs text-ink-muted">Refreshing…</span>}</div>
      {people.isPending ? <TableSkeleton /> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-ink-muted"><tr>{['Person', 'School code', 'Grade', 'Email', 'Role', 'Account', 'Actions'].map(label => <th key={label} className="pb-3 font-medium">{label}</th>)}</tr></thead><tbody>{people.data?.items.map(person => <tr key={person.id} className="border-t border-line"><td className="py-4 font-medium text-ink">{person.displayName}</td><td className="py-4 text-ink-muted">{person.studentCode ?? person.employeeCode ?? '—'}</td><td className="py-4 text-ink-muted">{person.gradeLevel ?? '—'}</td><td className="py-4 text-ink-muted">{person.email ?? '—'}</td><td className="py-4 text-ink-muted">{person.role === 'instructor' ? 'Teacher' : 'Student'}</td><td className="py-4 text-ink-muted">{accountLabel(person.accountState)}</td><td className="py-3">{person.role === 'student' && person.accountState === 'active' ? <Button size="sm" variant="secondary" icon={<KeyRoundIcon className="h-4 w-4" />} loading={issueRecovery.isPending && issueRecovery.variables?.id === person.id} onClick={() => { setError(null); issueRecovery.mutate(person); }}>Issue reset code</Button> : <span className="text-ink-subtle">—</span>}</td></tr>)}</tbody></table>{people.data?.items.length === 0 && <p className="border-t border-line py-10 text-center text-sm text-ink-muted">No people match this search.</p>}</div><Pagination page={peoplePage} pageSize={PAGE_SIZE} total={people.data?.total ?? 0} onPage={setPeoplePage} /></>}
    </section>}
    <Dialog open={Boolean(recoveryResult)} onClose={() => { setRecoveryResult(null); setRecoveryCopyError(null); setRecoveryCopied(false); }} title="Student password recovery" description={recoveryResult ? `One-time code for ${recoveryResult.name}. Expires ${new Date(recoveryResult.expiresAt).toLocaleString()}.` : undefined} footer={<><Button variant="secondary" onClick={() => { setRecoveryResult(null); setRecoveryCopyError(null); setRecoveryCopied(false); }}>Close</Button><Button variant="secondary" icon={<CopyIcon className="h-4 w-4" />} onClick={() => void copyRecoveryCode()}>{recoveryCopied ? 'Copied' : 'Copy code'}</Button></>}>
      {recoveryResult && <div className="space-y-3"><p className="text-sm text-ink-muted">Share this code directly with the student. It works once and expires in 30 minutes. Issuing another code invalidates this one.</p><div className="rounded-md bg-sunken px-4 py-3"><p className="text-xs text-ink-muted">Student code: {recoveryResult.studentCode}</p><p className="mt-1 break-all font-mono text-lg font-semibold text-ink">{recoveryResult.recoveryCode}</p></div>{recoveryCopyError && <p role="alert" className="text-sm text-danger">{recoveryCopyError}</p>}</div>}
    </Dialog>
  </div>;
}

function OverviewPanel({ data, onClassrooms, onImport, refreshing }: { data:{studentsCount:number;teachersCount:number;classroomsCount:number;robotResourcesCount:number;accountSetupPendingCount:number};onClassrooms:()=>void;onImport:()=>void;refreshing:boolean }) { return <section className="mt-8"><div className="flex justify-end text-xs text-ink-muted">{refreshing ? 'Refreshing…' : 'Current school data'}</div><div className="mt-2 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="bg-accent-ink p-7 text-white sm:p-9"><GraduationCapIcon className="h-8 w-8 text-accent-soft" /><h2 className="mt-10 max-w-[15ch] text-4xl font-semibold leading-none tracking-[-.05em]">Delivery begins with a well-scoped classroom.</h2><p className="mt-5 text-sm text-accent-soft">{data.classroomsCount} classroom record{data.classroomsCount===1?'':'s'} are available.</p><button onClick={onClassrooms} className="mt-8 text-sm font-semibold underline underline-offset-4">Review classrooms</button></div><div className="grid grid-cols-2 gap-px bg-line"><OverviewStat label="Students" value={data.studentsCount} /><OverviewStat label="Teachers" value={data.teachersCount} /><OverviewStat label="Robot resources" value={data.robotResourcesCount} /><OverviewStat label="Setup pending" value={data.accountSetupPendingCount} /><button onClick={onImport} className="col-span-2 bg-accent-soft p-5 text-left text-sm font-semibold text-accent-ink">Import roster changes</button></div></div></section>; }
function OverviewStat({label,value}:{label:string;value:number}) { return <div className="bg-surface p-5"><p className="text-3xl font-semibold text-ink">{value}</p><p className="mt-2 text-sm text-ink-muted">{label}</p></div>; }
function Pagination({page,pageSize,total,onPage}:{page:number;pageSize:number;total:number;onPage:(page:number)=>void}) { const pages=Math.max(1,Math.ceil(total/pageSize));return <div className="mt-4 flex items-center justify-end gap-3 text-sm"><Button size="sm" variant="secondary" disabled={page<=1} onClick={()=>onPage(page-1)}>Previous</Button><span className="text-ink-muted">Page {page} of {pages}</span><Button size="sm" variant="secondary" disabled={page>=pages} onClick={()=>onPage(page+1)}>Next</Button></div>; }
function OverviewSkeleton(){return <div aria-label="Loading school overview" className="mt-8 grid animate-pulse gap-5 lg:grid-cols-2"><div className="h-72 bg-sunken"/><div className="h-72 bg-sunken"/></div>;}
function TableSkeleton(){return <div aria-label="Loading school data" className="mt-6 space-y-3 animate-pulse">{[1,2,3,4].map(item=><div key={item} className="h-12 rounded bg-sunken"/>)}</div>;}
function accountLabel(state:string){return state==='account_setup_pending'?'Account setup pending':state==='invited'?'Invited':'Active';}
