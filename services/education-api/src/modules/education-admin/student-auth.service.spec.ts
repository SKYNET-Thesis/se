import { UnauthorizedException } from "@nestjs/common";
import { StudentAuthService } from "./student-auth.service";

const session = { access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600, token_type: "bearer" };

describe("StudentAuthService", () => {
  const queryRaw = jest.fn();
  const prismaExecuteRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const supabase = {
    authenticateStudent: jest.fn(),
    createStudentIdentity: jest.fn(),
    deleteStudentIdentity: jest.fn(),
    setStudentPassword: jest.fn(),
    replaceStudentLoginEmail: jest.fn(),
  };
  const service = new StudentAuthService({ $queryRaw: queryRaw, $executeRaw: prismaExecuteRaw, $transaction: transaction } as never, supabase as never);

  beforeEach(() => {
    queryRaw.mockReset();
    prismaExecuteRaw.mockReset().mockResolvedValue(1);
    executeRaw.mockReset().mockResolvedValue(1);
    transaction.mockReset().mockImplementation(callback => callback({ $executeRaw: executeRaw }));
    supabase.authenticateStudent.mockReset().mockResolvedValue(session);
    supabase.createStudentIdentity.mockReset().mockResolvedValue({ id: "auth-user-1" });
    supabase.deleteStudentIdentity.mockReset().mockResolvedValue(undefined);
    supabase.setStudentPassword.mockReset().mockResolvedValue(undefined);
    supabase.replaceStudentLoginEmail.mockReset().mockResolvedValue(undefined);
  });

  it("maps school and student codes to an internal Supabase identifier without returning it", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-user-1", auth_identifier: "identity-1", email: "contact@example.test", status: "active", account_state: "active" }]);

    const result = await service.login({ schoolCode: "VST-SCHOOL", studentCode: "S-1", password: "secret" });

    expect(result).toEqual(session);
    expect(supabase.authenticateStudent).toHaveBeenCalledWith("student-identity-1@students.auth.vista.invalid", "secret");
    expect(JSON.stringify(result)).not.toContain("contact@example.test");
  });

  it("rejects inactive and unresolved student profiles before provider authentication", async () => {
    queryRaw.mockResolvedValue([{ auth_user_id: null, auth_identifier: "identity-1", email: null, status: "invited", account_state: "account_setup_pending" }]);

    await expect(service.login({ schoolCode: "VST-SCHOOL", studentCode: "S-1", password: "secret" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("consumes the hashed setup token, activates the VISTA profile, and returns only provider session fields", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_identifier: "identity-1", organization_id: "org-1", setup_token_id: "token-1" }]);

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).resolves.toEqual(session);

    expect(supabase.createStudentIdentity).toHaveBeenCalledWith("student-identity-1@students.auth.vista.invalid", "student-created-password");
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls.flat()).not.toContain("student-created-password");
    expect(executeRaw.mock.calls.flat()).not.toContain("one-time-secret-code");
    expect(supabase.authenticateStudent).toHaveBeenCalledWith("student-identity-1@students.auth.vista.invalid", "student-created-password");
  });

  it("does not create a provider identity when another request already claimed the setup code", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_identifier: "identity-1", organization_id: "org-1", setup_token_id: "token-1" }]);
    prismaExecuteRaw.mockResolvedValueOnce(0);

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(supabase.createStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.deleteStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("cleans up a new provider identity and releases the code when domain activation fails", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_identifier: "identity-1", auth_user_id: null, organization_id: "org-1", setup_token_id: "token-1" }]);
    transaction.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(supabase.deleteStudentIdentity).toHaveBeenCalledWith("auth-user-1");
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(2);
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("sets the password on an already-linked student provider identity", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_identifier: "identity-1", auth_user_id: "auth-existing", organization_id: "org-1", setup_token_id: "token-1" }]);

    await service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" });

    expect(supabase.setStudentPassword).toHaveBeenCalledWith("auth-existing", "student-created-password");
    expect(supabase.replaceStudentLoginEmail).toHaveBeenCalledWith("auth-existing", "student-identity-1@students.auth.vista.invalid");
    expect(supabase.createStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.deleteStudentIdentity).not.toHaveBeenCalled();
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls[1][0].join(" ")).toContain("account_state IN ('account_setup_pending', 'invited')");
  });
});