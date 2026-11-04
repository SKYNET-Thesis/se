import { ImportProvisioningError } from "./import-errors";
import { SupabaseAdminService } from "./supabase-admin.service";

describe("SupabaseAdminService", () => {
  const config = { get: jest.fn((name:string) => ({ SUPABASE_URL:"https://project.supabase.co", SUPABASE_ANON_KEY:"public-anon-key", SUPABASE_SERVICE_ROLE_KEY:"server-secret", SUPABASE_INVITE_REDIRECT_URL:"https://app.example.com/login" })[name]) };
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

  it("creates a student identity with server-only service credentials", async () => {
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "auth-student-1" }), { status: 200 }));

    await expect(service.createStudentIdentity("student-id@students.auth.vista.invalid", "student-password")).resolves.toEqual({ id: "auth-student-1" });

    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ apikey: "server-secret", Authorization: "Bearer server-secret" });
    expect(fetchMock.mock.calls[1][1]?.body).toContain("student-password");
  });

  it("uses only the public anon key for password authentication", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), { status: 200 }));

    await service.authenticateStudent("student-id@students.auth.vista.invalid", "student-password");

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ apikey: "public-anon-key", Authorization: "Bearer public-anon-key" });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toMatchObject({ apikey: "server-secret" });
  });
});
