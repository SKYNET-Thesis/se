import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImportProvisioningError } from "./import-errors";

type SupabaseAdminUser = { id: string; email?: string };

export interface SupabasePasswordSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}

@Injectable()
export class SupabaseAdminService {
  constructor(private readonly config: ConfigService) {}

  async createStudentIdentityIfMissing(internalEmail: string, password: string): Promise<{ user: SupabaseAdminUser; created: boolean }> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: internalEmail, password, email_confirm: true }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // A timed-out create may still have reached Auth. Resolve by exact alias before reporting failure.
      try {
        const possiblyCreated = await this.findStudentIdentityByAlias(internalEmail, baseUrl, serviceRole);
        if (possiblyCreated) return { user: possiblyCreated, created: false };
      } catch { /* preserve generic provider error */ }
      throw new Error("Student identity provider is unavailable.");
    }
    if (response.ok) {
      const user = await response.json() as SupabaseAdminUser;
      if (!user.id) throw new Error("Student identity provider returned an invalid result.");
      return { user, created: true };
    }
    // Resolve a duplicate-create race by looking up the exact internal alias. The caller must verify the orphan mapping before reuse.
    if (response.status === 422 || response.status === 409) {
      const raced = await this.findStudentIdentityByAlias(internalEmail, baseUrl, serviceRole);
      if (raced) return { user: raced, created: false };
    }
    throw new Error("Student identity could not be created.");
  }

  async createStudentIdentity(internalEmail: string, password: string): Promise<SupabaseAdminUser> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    const existing = await this.findByEmail(internalEmail, baseUrl, serviceRole);
    if (existing) {
      await this.setStudentPassword(existing.id, password);
      return existing;
    }
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: internalEmail, password, email_confirm: true }),
      });
    } catch {
      throw new Error("Student identity provider is unavailable.");
    }
    if (!response.ok) throw new Error("Student identity could not be created.");
    return response.json() as Promise<SupabaseAdminUser>;
  }

  async deleteStudentIdentity(authUserId: string): Promise<void> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    const response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    });
    if (!response.ok) throw new Error("Student identity cleanup failed.");
  }

  async replaceStudentLoginEmail(authUserId: string, internalEmail: string): Promise<void> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    const response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "PUT",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: internalEmail, email_confirm: true }),
    });
    if (!response.ok) throw new Error("Student identity migration failed.");
  }

  async setStudentPassword(authUserId: string, password: string): Promise<void> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    const response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "PUT",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password, email_confirm: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Student password setup failed.");
  }

  /** Revokes every session of the signed-in student except the one that owns `accessToken` (GoTrue logout scope=others). Best effort. */
  async revokeOtherSessions(accessToken: string): Promise<boolean> {
    const baseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const anonKey = this.config.get<string>("SUPABASE_ANON_KEY");
    if (!baseUrl || !anonKey) return false;
    try {
      const response = await fetch(`${baseUrl}/auth/v1/logout?scope=others`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch { return false; }
  }

  async authenticateStudent(internalEmail: string, password: string): Promise<SupabasePasswordSession> {
    const baseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const anonKey = this.config.get<string>("SUPABASE_ANON_KEY");
    if (!baseUrl || !anonKey) throw new Error("Supabase password authentication is not configured.");
    if (process.env.NODE_ENV === "production" && new URL(baseUrl).protocol !== "https:") throw new Error("Supabase password authentication requires HTTPS.");
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: internalEmail, password }),
    });
    if (!response.ok) throw new Error("Student credentials were rejected.");
    const payload = await response.json() as Partial<SupabasePasswordSession>;
    if (typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string" || typeof payload.expires_in !== "number") {
      throw new Error("Supabase returned an invalid student session.");
    }
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in,
      expires_at: payload.expires_at,
      token_type: typeof payload.token_type === "string" ? payload.token_type : "bearer",
    };
  }

  /** Strict create: never reuses an existing identity. `created:false` means the e-mail already existed and nothing was changed. */
  async createStaffIdentity(email: string, password: string): Promise<{ user: SupabaseAdminUser; created: boolean }> {
    return this.createStudentIdentityIfMissing(email, password);
  }

  /** Reads one Auth user by id (read-only). Used to prove that a pending account never signed in before issuing temporary credentials. */
  async getAuthUser(authUserId: string): Promise<{ id: string; email?: string; lastSignInAt: string | null } | null> {
    const { baseUrl, serviceRole } = this.adminConfiguration();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error("Identity provider is unavailable."); }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Identity could not be verified.");
    const body = await response.json() as { id: string; email?: string; last_sign_in_at?: string | null };
    return { id: body.id, email: body.email, lastSignInAt: body.last_sign_in_at ?? null };
  }

  async invite(email: string, fullName: string): Promise<SupabaseAdminUser> {
    const baseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const serviceRole = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceRole) throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", "Supabase Admin configuration is incomplete.");
    const existing = await this.findByEmail(email, baseUrl, serviceRole);
    if (existing) return existing;
    const inviteUrl = new URL(`${baseUrl}/auth/v1/invite`);
    const redirectTo = this.config.get<string>("SUPABASE_INVITE_REDIRECT_URL")?.trim();
    if (redirectTo) inviteUrl.searchParams.set("redirect_to", redirectTo);
    let response: Response;
    try { response = await fetch(inviteUrl, { method: "POST", headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, data: { full_name: fullName } }) }); }
    catch (error) { throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", error instanceof Error ? error.message : "Invite network failure."); }
    if (!response.ok) throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", `Invite HTTP ${response.status}: ${await response.text()}`);
    return response.json() as Promise<SupabaseAdminUser>;
  }

  /** Sends the invitation e-mail again to a person who has not accepted it yet (the caller has verified that locally). */
  async resendInvite(email: string, fullName: string): Promise<void> {
    const baseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const serviceRole = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceRole) throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", "Supabase Admin configuration is incomplete.");
    const inviteUrl = new URL(`${baseUrl}/auth/v1/invite`);
    const redirectTo = this.config.get<string>("SUPABASE_INVITE_REDIRECT_URL")?.trim();
    if (redirectTo) inviteUrl.searchParams.set("redirect_to", redirectTo);
    let response: Response;
    try { response = await fetch(inviteUrl, { method: "POST", headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, data: { full_name: fullName } }), signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", error instanceof Error ? error.message : "Invite network failure."); }
    if (!response.ok) throw new ImportProvisioningError("ACCOUNT_INVITE_FAILED", `Invite HTTP ${response.status}`);
  }

  private async findStudentIdentityByAlias(email: string, baseUrl: string, serviceRole: string): Promise<SupabaseAdminUser | null> {
    for (let page = 1; page <= 100; page += 1) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
          headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error("Student identity provider is unavailable.");
      }
      if (!response.ok) throw new Error("Student identity could not be verified.");
      const payload = await response.json() as { users?: SupabaseAdminUser[] };
      const users = payload.users ?? [];
      const match = users.find(user => user.email?.toLowerCase() === email.toLowerCase());
      if (match) return match;
      if (users.length < 1000) return null;
    }
    throw new Error("Student identity could not be verified.");
  }

  private async findByEmail(email: string, baseUrl: string, serviceRole: string) {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } });
    if (!response.ok) return null;
    const payload = await response.json() as { users: SupabaseAdminUser[] };
    return payload.users.find(user => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
  }

  private adminConfiguration() {
    const baseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const serviceRole = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceRole) throw new Error("Supabase Admin configuration is incomplete.");
    if (process.env.NODE_ENV === "production" && new URL(baseUrl).protocol !== "https:") throw new Error("Supabase Admin requires HTTPS.");
    return { baseUrl, serviceRole };
  }
}
