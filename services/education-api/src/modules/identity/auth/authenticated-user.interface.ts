export interface AuthenticatedMembership {
  id: string;
  organizationId: string;
  roleCode: string;
  status: string;
  permissions: string[];
}

export interface AuthenticatedUser {
  authUserId: string;
  vistaUserId: string;
  email: string;
  status: string;
  systemRoleCodes: string[];
  systemPermissions: string[];
  memberships: AuthenticatedMembership[];
}
