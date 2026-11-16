import { assertSafeRuntimeRole } from './database-role';

describe('assertSafeRuntimeRole', () => {
  const safe = { currentUser: 'vista_app_runtime', superuser: false, bypassRls: false };

  it('accepts the expected non-superuser and non-BYPASSRLS role', () => {
    expect(() => assertSafeRuntimeRole(safe, 'vista_app_runtime')).not.toThrow();
  });

  it('rejects an unexpected login role', () => {
    expect(() => assertSafeRuntimeRole({ ...safe, currentUser: 'postgres' }, 'vista_app_runtime')).toThrow(/DATABASE_RUNTIME_ROLE/);
  });

  it('rejects superuser and BYPASSRLS attributes', () => {
    expect(() => assertSafeRuntimeRole({ ...safe, superuser: true }, 'vista_app_runtime')).toThrow(/superuser/i);
    expect(() => assertSafeRuntimeRole({ ...safe, bypassRls: true }, 'vista_app_runtime')).toThrow(/BYPASSRLS/i);
  });
});
