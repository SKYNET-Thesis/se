import { ImportProvisioningError } from "./import-errors";
import { SupabaseAdminService } from "./supabase-admin.service";

describe("SupabaseAdminService", () => {
  const config = { get: jest.fn((name:string) => ({ SUPABASE_URL:"https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"server-secret", SUPABASE_INVITE_REDIRECT_URL:"https://app.example.com/login" })[name]) };
  const service = new SupabaseAdminService(config as never);
  afterEach(() => jest.restoreAllMocks());

  it("reuses an existing auth identity without sending another invite", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ users:[{ id:"auth-1", email:"student@example.com" }] }), { status:200 }));
    await expect(service.invite("student@example.com", "Student One")).resolves.toMatchObject({ id:"auth-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the configured redirect and classifies provider failure internally", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ users:[] }), { status:200 })).mockResolvedValueOnce(new Response("raw smtp provider failure", { status:500 }));
    await expect(service.invite("student@example.com", "Student One")).rejects.toMatchObject<Partial<ImportProvisioningError>>({ code:"ACCOUNT_INVITE_FAILED" });
    expect(String(fetchMock.mock.calls[1][0])).toContain("redirect_to=https%3A%2F%2Fapp.example.com%2Flogin");
  });
});
