import { describe, expect, it, vi } from 'vitest';
import { loadAccessContext } from './accessContext';

describe('access context loading', () => {
  it('uses only the authoritative roles endpoint and reuses its memberships', async () => {
    const roles = vi.fn().mockResolvedValue({
      systemRoleCodes: [],
      memberships: [{ membershipId: 'membership-1', organizationId: 'org-a', roleCode: 'school_admin', status: 'active' }],
    });
    const memberships = vi.fn();

    const result = await loadAccessContext('token', { roles, memberships });

    expect(result.role).toBe('school_admin');
    expect(result.memberships).toHaveLength(1);
    expect(roles).toHaveBeenCalledTimes(1);
    expect(memberships).not.toHaveBeenCalled();
  });
});
