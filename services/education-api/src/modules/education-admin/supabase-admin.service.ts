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
    });
    if (!response.ok) throw new Error("Student password setup failed.");
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
