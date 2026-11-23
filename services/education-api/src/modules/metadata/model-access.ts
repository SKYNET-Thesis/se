import type { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";

/**
 * What a caller may read of the AI model registry (SRS UC-08 / FR-08).
 *  - full:   System Administrators and holders of the existing `model.use` capability. Unchanged: they see public models plus the
 *            private models they own or are entitled to, with owner references.
 *  - public: the other SRS actors (an active Student or Teacher/Instructor membership): read-only metadata of PUBLIC models only,
 *            without owner references. This never grants `model.use` and never touches the caller's permission lists.
 *  - none:   everyone else (School Admin, Teaching Assistant, no active membership): the registry does not exist for them.
 */
export type ModelAccess = "full" | "public" | "none";

/** Role codes of the SRS actors besides the System Administrator. `teacher` is accepted as the display name of `instructor`. */
export const PUBLIC_REGISTRY_ROLES: readonly string[] = ["student", "instructor", "teacher"];

export function modelAccess(user: AuthenticatedUser): ModelAccess {
  const systemAdmin = user.systemPermissions.includes("org.manage");
  const hasModelUse = user.systemPermissions.includes("model.use") || user.memberships.some((m) => m.status === "active" && m.permissions.includes("model.use"));
  if (systemAdmin || hasModelUse) return "full";
  if (user.memberships.some((m) => m.status === "active" && PUBLIC_REGISTRY_ROLES.includes(m.roleCode))) return "public";
  return "none";
}

/** Owner references are internal; a public-only reader never receives them. */
export function stripOwnerReferences<T extends Record<string, unknown>>(row: T): Omit<T, "owner_organization_id" | "owner_user_id"> {
  const { owner_organization_id: _organization, owner_user_id: _user, ...rest } = row;
  return rest;
}
