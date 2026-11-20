import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BuildingIcon, PlusIcon, UserPlusIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { Field, inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi, type ApiManagedOrganization } from '../../lib/api';

const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', closed: 'Closed' } as const;
// Text stays the high-contrast ink colour; the status colour is carried by the dot (and the label), so contrast never depends on a tint.
const STATUS_DOT = { active: 'bg-ok', suspended: 'bg-warn', closed: 'bg-danger' } as const;
const key = ['system-admin', 'organizations'] as const;

function message(error: unknown) { return error instanceof Error ? error.message : 'The request failed.'; }

/** System Administrator workspace: system-wide organization list, lifecycle and School Administrator assignment. */
export function AdminOrganizations() {
  const { session } = useSupabaseSession(); const token = session?.access_token ?? ''; const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false); const [selectedId, setSelectedId] = useState(''); const [filter, setFilter] = useState('');
  const list = useQuery({ queryKey: key, queryFn: () => educationAdminApi.managedOrganizations(token), enabled: Boolean(token) });
  const rows = (list.data ?? []).filter((org) => !filter.trim() || `${org.name} ${org.schoolCode ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const totals = (list.data ?? []).reduce((acc, org) => ({ orgs: acc.orgs + 1, active: acc.active + (org.status === 'active' ? 1 : 0), students: acc.students + org.studentCount, instructors: acc.instructors + org.instructorCount, classrooms: acc.classrooms + org.classroomCount }), { orgs: 0, active: 0, students: 0, instructors: 0, classrooms: 0 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="Organizations" description="Create schools, manage their status and assign School Administrators. Every school's data stays isolated from the others."
        actions={<Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>New organization</Button>} />
      <dl aria-label="System summary" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Organizations', totals.orgs], ['Active', totals.active], ['Classrooms', totals.classrooms], ['Instructors', totals.instructors], ['Students', totals.students]].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-line bg-surface p-4"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold text-ink">{value}</dd></div>
        ))}
      </dl>
      <div className="mt-6"><label className="sr-only" htmlFor="org-filter">Search organizations</label>
        <input id="org-filter" className={inputClasses} placeholder="Search by name or school code" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      {list.isLoading ? <p className="mt-6 text-sm text-ink-muted" role="status">Loading organizations…</p> : null}
      {list.isError ? <p className="mt-6 text-sm text-danger" role="alert">{message(list.error)} <button className="underline" onClick={() => list.refetch()}>Retry</button></p> : null}
      {list.isSuccess && rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-10 text-center"><BuildingIcon className="mx-auto h-8 w-8 text-ink-subtle" /><p className="mt-2 font-medium text-ink">{filter ? 'No organization matches your search' : 'No organizations yet'}</p>
          {!filter ? <p className="text-sm text-ink-muted">Create the first school to get started.</p> : null}</div>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase text-ink-muted"><th className="py-2 pr-3">Organization</th><th className="pr-3">Code</th><th className="pr-3">Status</th><th className="pr-3">Admins</th><th className="pr-3">Instructors</th><th className="pr-3">Students</th><th className="pr-3">Classrooms</th><th /></tr></thead>
          <tbody>{rows.map((org) => (
            <tr key={org.id} className="border-b border-line/60" data-testid="org-row">
              <td className="py-3 pr-3 font-medium text-ink">{org.name}</td><td className="pr-3 font-mono text-xs">{org.schoolCode ?? '—'}</td>
              <td className="pr-3"><span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT[org.status]}`} />{STATUS_LABEL[org.status]}</span></td>
              <td className="pr-3">{org.administratorCount}</td><td className="pr-3">{org.instructorCount}</td><td className="pr-3">{org.studentCount}</td><td className="pr-3">{org.classroomCount}</td>
              <td className="text-right"><Button variant="secondary" size="sm" onClick={() => setSelectedId(org.id)} aria-label={`Manage ${org.name}`}>Manage</Button></td>
            </tr>))}</tbody></table></div>
      ) : null}
      <CreateOrganizationDialog open={createOpen} onClose={() => setCreateOpen(false)} token={token} onCreated={(org) => { setCreateOpen(false); refresh(); setSelectedId(org.id); }} />
      <ManageOrganizationDialog organizationId={selectedId} onClose={() => setSelectedId('')} token={token} onChanged={refresh} summary={list.data?.find((org) => org.id === selectedId)} />
    </div>
  );
}

function CreateOrganizationDialog({ open, onClose, token, onCreated }: { open: boolean; onClose: () => void; token: string; onCreated: (org: ApiManagedOrganization) => void }) {
  const [name, setName] = useState(''); const [schoolCode, setSchoolCode] = useState(''); const [error, setError] = useState('');
  const create = useMutation({ mutationFn: () => educationAdminApi.createOrganization(token, { name: name.trim(), ...(schoolCode.trim() ? { schoolCode: schoolCode.trim() } : {}) }),
    onSuccess: (org) => { setName(''); setSchoolCode(''); setError(''); onCreated(org); }, onError: (e) => setError(message(e)) });
  const valid = name.trim().length > 0;
  return (
    <Dialog open={open} onClose={onClose} title="New organization" description="A school is created active, with no administrator. Assign one next."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Create organization'}</Button></>}>
      <div className="space-y-4">
        <Field label="Organization name">{(p) => <input {...p} className={inputClasses} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="School code (optional)" hint="Students sign in with this code. Leave blank to generate one.">{(p) => <input {...p} className={inputClasses} value={schoolCode} maxLength={32} onChange={(e) => setSchoolCode(e.target.value)} />}</Field>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

function ManageOrganizationDialog({ organizationId, onClose, token, onChanged, summary }: { organizationId: string; onClose: () => void; token: string; onChanged: () => void; summary?: ApiManagedOrganization }) {
  const queryClient = useQueryClient(); const detailKey = ['system-admin', 'organization', organizationId];
  const [email, setEmail] = useState(''); const [fullName, setFullName] = useState(''); const [renameTo, setRenameTo] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const detail = useQuery({ queryKey: detailKey, queryFn: () => educationAdminApi.organizationDetail(organizationId, token), enabled: Boolean(organizationId && token) });
  const settle = () => { queryClient.invalidateQueries({ queryKey: detailKey }); onChanged(); };
  const update = useMutation({ mutationFn: (body: { name?: string; status?: string }) => educationAdminApi.updateOrganization(organizationId, token, body), onSuccess: () => { setError(''); setRenameTo(''); settle(); }, onError: (e) => setError(message(e)) });
  const assign = useMutation({ mutationFn: () => educationAdminApi.assignOrganizationAdministrator(organizationId, token, { email: email.trim(), fullName: fullName.trim() }), onSuccess: () => { setEmail(''); setFullName(''); setError(''); settle(); }, onError: (e) => setError(message(e)) });
  const resend = useMutation({ mutationFn: (userId: string) => educationAdminApi.reissueAdministratorInvitation(organizationId, userId, token), onSuccess: (r) => { setError(''); setNotice(`Invitation sent again to ${r.email}.`); }, onError: (e) => { setNotice(''); setError(message(e)); } });
  const account = useMutation({ mutationFn: (input: { userId: string; status: 'active' | 'disabled' }) => educationAdminApi.setAccountStatus(input.userId, token, input.status), onSuccess: (_r, input) => { setError(''); setNotice(input.status === 'disabled' ? 'Account disabled.' : 'Account enabled.'); settle(); }, onError: (e) => { setNotice(''); setError(message(e)); } });
  const revoke = useMutation({ mutationFn: (userId: string) => educationAdminApi.revokeOrganizationAdministrator(organizationId, userId, token), onSuccess: () => { setError(''); settle(); }, onError: (e) => setError(message(e)) });
  const org = detail.data ?? summary; const validAdmin = /\S+@\S+\.\S+/.test(email.trim()) && fullName.trim().length >= 2;
  return (
    <Dialog open={Boolean(organizationId)} onClose={onClose} title={org?.name ?? 'Organization'} size="lg" description={org?.schoolCode ? `School code ${org.schoolCode}` : undefined}>
      {detail.isLoading ? <p className="text-sm text-ink-muted" role="status">Loading…</p> : null}
      {detail.isError ? <p className="text-sm text-danger" role="alert">{message(detail.error)}</p> : null}
      {detail.data ? (
        <div className="space-y-6">
          <section aria-label="Status" className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Status: <span data-testid="org-status">{STATUS_LABEL[detail.data.status]}</span></h3>
            <p className="text-xs text-ink-muted">Suspending an organization immediately blocks all of its members. Closing is permanent.</p>
            <div className="flex flex-wrap gap-2">
              {detail.data.status === 'active' ? <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ status: 'suspended' })}>Suspend organization</Button> : null}
              {detail.data.status === 'suspended' ? <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ status: 'active' })}>Reactivate organization</Button> : null}
              {detail.data.status !== 'closed' ? <Button variant="danger" disabled={update.isPending} onClick={() => { if (window.confirm(`Close ${detail.data.name}? This cannot be undone.`)) update.mutate({ status: 'closed' }); }}>Close organization</Button> : null}
            </div>
          </section>
          <section aria-label="Rename" className="flex items-end gap-2">
            <Field label="Rename organization" className="flex-1">{(p) => <input {...p} className={inputClasses} placeholder={detail.data.name} value={renameTo} maxLength={160} onChange={(e) => setRenameTo(e.target.value)} />}</Field>
            <Button variant="secondary" disabled={!renameTo.trim() || update.isPending} onClick={() => update.mutate({ name: renameTo.trim() })}>Save name</Button>
          </section>
          <section aria-label="School administrators" className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">School administrators</h3>
            {detail.data.administrators.length === 0 ? <p className="text-sm text-ink-muted">No administrator assigned yet.</p> : (
              <ul className="divide-y divide-line rounded-md border border-line">{detail.data.administrators.map((admin) => (
                <li key={admin.userId} className="flex items-center justify-between gap-3 p-3 text-sm" data-testid="org-admin">
                  <span><span className="font-medium text-ink">{admin.fullName}</span> <span className="text-ink-muted">{admin.email}</span>
                    <span className="ml-2 text-xs text-ink-muted">{admin.userStatus === 'disabled' ? 'Disabled' : admin.membershipStatus === 'active' ? (admin.accountState === 'invited' ? 'Invited' : 'Active') : 'Removed'}</span></span>
                  <span className="flex flex-wrap gap-2">
                    {admin.accountState === 'invited' && admin.userStatus !== 'disabled' ? <Button variant="secondary" size="sm" disabled={resend.isPending} onClick={() => { setNotice(''); resend.mutate(admin.userId); }} aria-label={`Resend invitation to ${admin.fullName}`}>Resend invitation</Button> : null}
                    <Button variant="secondary" size="sm" disabled={account.isPending} onClick={() => { setNotice(''); account.mutate({ userId: admin.userId, status: admin.userStatus === 'disabled' ? 'active' : 'disabled' }); }} aria-label={`${admin.userStatus === 'disabled' ? 'Enable' : 'Disable'} account of ${admin.fullName}`}>{admin.userStatus === 'disabled' ? 'Enable account' : 'Disable account'}</Button>
                    {admin.membershipStatus === 'active' ? <Button variant="secondary" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(admin.userId)} aria-label={`Remove ${admin.fullName}`}>Remove</Button> : null}
                  </span>
                </li>))}</ul>)}
            {detail.data.status !== 'closed' ? (
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <Field label="Administrator name">{(p) => <input {...p} className={inputClasses} value={fullName} maxLength={160} onChange={(e) => setFullName(e.target.value)} />}</Field>
                <Field label="Administrator email">{(p) => <input {...p} type="email" className={inputClasses} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />}</Field>
                <Button variant="primary" icon={<UserPlusIcon className="h-4 w-4" />} disabled={!validAdmin || assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? 'Assigning…' : 'Assign administrator'}</Button>
              </div>) : null}
          </section>
          {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}
