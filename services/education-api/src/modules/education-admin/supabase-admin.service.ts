import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImportProvisioningError } from "./import-errors";

type SupabaseAdminUser = { id: string; email?: string };

@Injectable()
export class SupabaseAdminService {
  constructor(private readonly config: ConfigService) {}

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
}
