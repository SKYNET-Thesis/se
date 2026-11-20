import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/ui/PageHeader';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi } from '../../lib/api';

const LABEL: Record<string, string> = { school_admin: 'School Administrator', instructor: 'Instructor', student: 'Student' };
const label = (code: string) => LABEL[code] ?? code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Read-only role and permission matrix for the school. Permissions are defined by the platform and enforced by the API. */
export function SchoolRoles() {
  const { session } = useSupabaseSession(); const { memberships } = useRole(); const token = session?.access_token ?? '';
  const organizationId = memberships.find((item) => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const roles = useQuery({ queryKey: ['school-admin', organizationId, 'roles'], queryFn: () => educationAdminApi.schoolRoles(organizationId, token), enabled: Boolean(organizationId && token) });
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="Roles & permissions" description="What each role can do in your school. Permissions are set by the platform and enforced by the server." />
      {roles.isLoading ? <p className="mt-6 text-sm text-ink-muted" role="status">Loading roles…</p> : null}
      {roles.isError ? <p className="mt-6 text-sm text-danger" role="alert">{roles.error instanceof Error ? roles.error.message : 'Could not load roles.'}</p> : null}
      {roles.data?.length === 0 ? <p className="mt-6 text-sm text-ink-muted">No roles are defined.</p> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {roles.data?.map((role) => (
          <section key={role.code} aria-label={label(role.code)} className="rounded-lg border border-line bg-surface p-5" data-testid="role-card">
            <div className="flex items-baseline justify-between"><h2 className="font-semibold text-ink">{label(role.code)}</h2><span className="text-xs text-ink-muted">{role.memberCount} active {role.memberCount === 1 ? 'member' : 'members'}</span></div>
            {role.permissions.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No permissions granted.</p> : (
              <ul className="mt-3 flex flex-wrap gap-1.5">{role.permissions.map((code) => <li key={code} className="rounded bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-muted">{code}</li>)}</ul>)}
          </section>))}
      </div>
    </div>
  );
}
