import type { Role } from '../../types/user';

/** CSS class that carries the VISTA School Administration palette (see index.css). */
export const SCHOOL_BRAND_SCOPE = 'vista-school';

/**
 * The palette follows the active resolved role, which RoleContext derives from active memberships only
 * (accessContext.resolveRole). An inactive or past school_admin membership never resolves to `school_admin`.
 */
export function brandScopeFor(role: Role | null | undefined): string | null {
  return role === 'school_admin' ? SCHOOL_BRAND_SCOPE : null;
}
