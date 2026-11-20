import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Field, inputClasses } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi } from '../../lib/api';

/** School Administrator: the school's profile (name editable), identity code, status, contract and administrators. */
export function SchoolProfile() {
  const { session } = useSupabaseSession(); const { memberships } = useRole(); const token = session?.access_token ?? ''; const queryClient = useQueryClient();
  const organizationId = memberships.find((item) => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const profile = useQuery({ queryKey: ['school-admin', organizationId, 'profile'], queryFn: () => educationAdminApi.schoolProfile(organizationId, token), enabled: Boolean(organizationId && token) });
  const save = useMutation({ mutationFn: () => educationAdminApi.updateSchoolProfile(organizationId, token, { name: name.trim() }),
    onSuccess: () => { setError(''); setSaved(true); setName(''); void queryClient.invalidateQueries({ queryKey: ['school-admin', organizationId, 'profile'] }); }, onError: (e) => { setSaved(false); setError(e instanceof Error ? e.message : 'The request failed.'); } });
  const data = profile.data;
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : 'Not set');
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="School profile" description="How your school appears across VISTA. Students sign in with the school code." />
      {profile.isLoading ? <p className="mt-6 text-sm text-ink-muted" role="status">Loading school profile…</p> : null}
      {profile.isError ? <p className="mt-6 text-sm text-danger" role="alert">{profile.error instanceof Error ? profile.error.message : 'Could not load the profile.'}</p> : null}
      {data ? (
        <div className="mt-6 space-y-8">
          <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
            <div><dt className="text-xs text-ink-muted">School name</dt><dd className="mt-1 font-medium text-ink" data-testid="school-name">{data.name}</dd></div>
            <div><dt className="text-xs text-ink-muted">School code</dt><dd className="mt-1 font-mono text-sm text-ink" data-testid="school-code">{data.schoolCode ?? 'Assigned when students are first added'}</dd></div>
            <div><dt className="text-xs text-ink-muted">Status</dt><dd className="mt-1 text-ink capitalize">{data.status}</dd></div>
            <div><dt className="text-xs text-ink-muted">Contract</dt><dd className="mt-1 text-ink">{date(data.contractStart)} – {date(data.contractEnd)}</dd></div>
          </dl>
          <section aria-label="Rename school" className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Change school name" className="flex-1">{(p) => <input {...p} className={inputClasses} placeholder={data.name} value={name} maxLength={160} onChange={(e) => { setName(e.target.value); setSaved(false); }} />}</Field>
            <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save name'}</Button>
          </section>
          {saved ? <p role="status" className="text-sm text-ok">School name updated.</p> : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <section aria-label="School administrators"><h2 className="text-sm font-semibold text-ink">School administrators</h2>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">{data.administrators.map((admin) => (<li key={admin.userId} className="p-3 text-sm"><span className="font-medium text-ink">{admin.fullName}</span> <span className="text-ink-muted">{admin.email}</span></li>))}</ul>
            <p className="mt-2 text-xs text-ink-muted">Administrators are assigned by the platform System Administrator.</p></section>
        </div>) : null}
    </div>
  );
}
