import type { ApiAccessContext, ApiOrganizationMembership } from '../lib/api';
import type { Role } from '../types/user';

interface AccessApi {
  roles(token: string): Promise<ApiAccessContext>;
  memberships?: (token: string) => Promise<ApiOrganizationMembership[]>;
}

function resolveRole(systemRoleCodes: string[], memberships: ApiOrganizationMembership[]): Role | null {
  if (systemRoleCodes.includes('system_admin')) return 'admin';
  const active = memberships.filter(item => item.status === 'active').map(item => item.roleCode);
  if (active.includes('school_admin')) return 'school_admin';
  if (active.includes('instructor')) return 'teacher';
  if (active.includes('student')) return 'student';
  return null;
}

export async function loadAccessContext(token: string, api: AccessApi) {
  const access = await api.roles(token);
  const memberships = Array.isArray(access.memberships) ? access.memberships : [];
  return { role: resolveRole(access.systemRoleCodes ?? [], memberships), memberships };
}
