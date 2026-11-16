export interface RuntimeRoleIdentity {
  currentUser: string;
  superuser: boolean;
  bypassRls: boolean;
}

export function assertSafeRuntimeRole(identity: RuntimeRoleIdentity, expectedRole: string): void {
  if (identity.currentUser !== expectedRole) {
    throw new Error(`DATABASE_RUNTIME_ROLE expected ${expectedRole}, PostgreSQL connected as ${identity.currentUser}.`);
  }
  if (identity.superuser) throw new Error('Education API PostgreSQL runtime role must not be a superuser.');
  if (identity.bypassRls) throw new Error('Education API PostgreSQL runtime role must not have BYPASSRLS.');
}
