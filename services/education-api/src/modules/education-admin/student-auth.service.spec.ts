import { createHash } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { StudentAuthService } from "./student-auth.service";

const session = { access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600, token_type: "bearer" };

describe("StudentAuthService", () => {
  const queryRaw = jest.fn();
  const prismaExecuteRaw = jest.fn();
  const executeRaw = jest.fn();
  const txQueryRaw = jest.fn();
  const transaction = jest.fn();
  const supabase = {
    authenticateStudent: jest.fn(),
    createStudentIdentity: jest.fn(),
    deleteStudentIdentity: jest.fn(),
    setStudentPassword: jest.fn(),
    revokeOtherSessions: jest.fn().mockResolvedValue(true),
    replaceStudentLoginEmail: jest.fn(),
  };
  const service = new StudentAuthService({ $queryRaw: queryRaw, $executeRaw: prismaExecuteRaw, $transaction: transaction } as never, supabase as never);

  beforeAll(() => { process.env.STUDENT_TEMP_PASSWORD_ENABLED = "true"; });
  afterAll(() => { delete process.env.STUDENT_TEMP_PASSWORD_ENABLED; });

  beforeEach(() => {
    queryRaw.mockReset();
    prismaExecuteRaw.mockReset().mockResolvedValue(1);
    executeRaw.mockReset().mockResolvedValue(1);
    transaction.mockReset().mockImplementation(callback => callback({ $executeRaw: executeRaw, $queryRaw: txQueryRaw }));
    txQueryRaw.mockReset();
    supabase.authenticateStudent.mockReset().mockResolvedValue(session);
    supabase.createStudentIdentity.mockReset().mockResolvedValue({ id: "auth-user-1" });
    supabase.deleteStudentIdentity.mockReset().mockResolvedValue(undefined);
    supabase.setStudentPassword.mockReset().mockResolvedValue(undefined);
    supabase.replaceStudentLoginEmail.mockReset().mockResolvedValue(undefined);
  });

  it("maps school and student codes to an internal Supabase identifier without returning it", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-user-1", email: "contact@example.test", status: "active", account_state: "active", password_change_required: false }]);

    const result = await service.login({ schoolCode: "VST-SCHOOL", studentCode: "S-1", password: "secret" });

    expect(result).toEqual({ ...session, password_change_required: false });
    expect(supabase.authenticateStudent).toHaveBeenCalledWith("student-user-1@students.auth.vista.invalid", "secret");
    expect(JSON.stringify(result)).not.toContain("contact@example.test");
  });

  it("rejects inactive and unresolved student profiles before provider authentication", async () => {
    queryRaw.mockResolvedValue([{ auth_user_id: null, email: null, status: "invited", account_state: "account_setup_pending" }]);

    await expect(service.login({ schoolCode: "VST-SCHOOL", studentCode: "S-1", password: "secret" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("consumes the hashed setup token, activates the VISTA profile, and returns only provider session fields", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", organization_id: "org-1", setup_token_id: "token-1" }]);

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).resolves.toEqual(session);

    expect(supabase.createStudentIdentity).toHaveBeenCalledWith("student-user-1@students.auth.vista.invalid", "student-created-password");
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(2); // claim the setup code + remove a stale alias stub before the identity is created
    expect(prismaExecuteRaw.mock.calls[1][0].join(" ")).toContain("DELETE FROM public.users");
    expect(executeRaw).toHaveBeenCalledTimes(3); // remove the trigger-created duplicate, link the student row, activate the profile
    const stubDelete = executeRaw.mock.calls[0][0].join(" ");
    expect(stubDelete).toContain("DELETE FROM public.users");
    expect(stubDelete).toContain("NOT EXISTS (SELECT 1 FROM public.memberships");
    expect(stubDelete).toContain("NOT EXISTS (SELECT 1 FROM public.education_school_user_profiles");
    expect(executeRaw.mock.calls[0]).toContain("student-user-1@students.auth.vista.invalid");
    expect(executeRaw.mock.calls.flat()).not.toContain("student-created-password");
    expect(executeRaw.mock.calls.flat()).not.toContain("one-time-secret-code");
    expect(supabase.authenticateStudent).toHaveBeenCalledWith("student-user-1@students.auth.vista.invalid", "student-created-password");
  });

  it("does not create a provider identity when another request already claimed the setup code", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", organization_id: "org-1", setup_token_id: "token-1" }]);
    prismaExecuteRaw.mockResolvedValueOnce(0);

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(supabase.createStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.deleteStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("cleans up a new provider identity and releases the code when domain activation fails", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: null, organization_id: "org-1", setup_token_id: "token-1" }]);
    transaction.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(supabase.deleteStudentIdentity).toHaveBeenCalledWith("auth-user-1");
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(4); // claim, pre-clean, stub cleanup after the failed activation, release of the setup code
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("sets the password on an already-linked student provider identity", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-existing", organization_id: "org-1", setup_token_id: "token-1" }]);

    await service.setup({ schoolCode: "VST-SCHOOL", studentCode: "S-1", setupCode: "one-time-secret-code", password: "student-created-password" });

    expect(supabase.setStudentPassword).toHaveBeenCalledWith("auth-existing", "student-created-password");
    expect(supabase.replaceStudentLoginEmail).toHaveBeenCalledWith("auth-existing", "student-user-1@students.auth.vista.invalid");
    expect(supabase.createStudentIdentity).not.toHaveBeenCalled();
    expect(supabase.deleteStudentIdentity).not.toHaveBeenCalled();
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw.mock.calls[2][0].join(" ")).toContain("account_state IN ('account_setup_pending', 'invited')");
  });


  it("changes a temporary password once and returns a newer Supabase session", async () => {
    txQueryRaw.mockResolvedValueOnce([{ user_id: "user-1", auth_user_id: "auth-user-1" }])
      .mockResolvedValueOnce([{ password_changed_at: new Date(Date.now() - 1500) }]);
    executeRaw.mockResolvedValueOnce(1);
    const actor = { vistaUserId: "user-1", authUserId: "auth-user-1" } as never;
    const result = await service.changeFirstLoginPassword(actor, { currentPassword: "temporary-password", newPassword: "new-secure-password" });
    expect(result).toEqual(session);
    expect(supabase.authenticateStudent).toHaveBeenNthCalledWith(1, "student-user-1@students.auth.vista.invalid", "temporary-password");
    expect(supabase.setStudentPassword).toHaveBeenCalledWith("auth-user-1", "new-secure-password");
    expect(supabase.authenticateStudent).toHaveBeenNthCalledWith(2, "student-user-1@students.auth.vista.invalid", "new-secure-password");
    expect(executeRaw.mock.calls[0][0].join(" ")).toContain("password_change_required = false");
    // Prisma's 5 s default interactive-transaction timeout is too short for four identity-provider round trips under classroom concurrency.
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 15_000, timeout: 45_000 });
  });

  it("rejects a wrong temporary password without updating Supabase", async () => {
    txQueryRaw.mockResolvedValueOnce([{ user_id: "user-1", auth_user_id: "auth-user-1" }]);
    supabase.authenticateStudent.mockRejectedValueOnce(new Error("invalid credential"));
    await expect(service.changeFirstLoginPassword({ vistaUserId: "user-1", authUserId: "auth-user-1" } as never, { currentPassword: "wrong-password", newPassword: "new-secure-password" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(supabase.setStudentPassword).not.toHaveBeenCalled();
  });

  it("rejects concurrent or repeated completion after the database row lock finds no pending state", async () => {
    txQueryRaw.mockResolvedValueOnce([]);
    await expect(service.changeFirstLoginPassword({ vistaUserId: "user-1", authUserId: "auth-user-1" } as never, { currentPassword: "temporary-password", newPassword: "new-secure-password" })).rejects.toMatchObject({ status: 409 });
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("rejects temporary-password reuse before contacting Supabase", async () => {
    await expect(service.changeFirstLoginPassword({ vistaUserId: "user-1", authUserId: "auth-user-1" } as never, { currentPassword: "same-password", newPassword: "same-password" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("consumes a hashed password recovery code and authenticates with the new password", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-existing", recovery_token_id: "token-1" }]);

    await expect(service.recover({ schoolCode: "VST-SCHOOL", studentCode: "S-1", recoveryCode: "one-time-recovery-code", password: "new-student-password" })).resolves.toEqual({ status: "password_updated" });

    expect(queryRaw.mock.calls[0]).toContain(createHash("sha256").update("one-time-recovery-code", "utf8").digest("hex"));
    expect(queryRaw.mock.calls[0]).not.toContain("one-time-recovery-code");
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(1);
    expect(prismaExecuteRaw.mock.calls[0][0].join(" ")).toContain("password_reset");
    expect(prismaExecuteRaw.mock.calls.flat()).not.toContain("one-time-recovery-code");
    expect(supabase.setStudentPassword).toHaveBeenCalledWith("auth-existing", "new-student-password");
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });

  it("does not reset a password when the recovery code is missing or already consumed", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-existing", recovery_token_id: "token-1" }]);
    prismaExecuteRaw.mockResolvedValueOnce(0);

    await expect(service.recover({ schoolCode: "VST-SCHOOL", studentCode: "S-1", recoveryCode: "one-time-recovery-code", password: "new-student-password" })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(supabase.setStudentPassword).not.toHaveBeenCalled();
    expect(supabase.authenticateStudent).not.toHaveBeenCalled();
  });
});

describe("StudentAuthService with the temporary-password rollout disabled (default)", () => {
  const queryRaw = jest.fn();
  const supabase = { authenticateStudent: jest.fn() };
  const service = new StudentAuthService({ $queryRaw: queryRaw } as never, supabase as never);
  beforeEach(() => { delete process.env.STUDENT_TEMP_PASSWORD_ENABLED; queryRaw.mockReset(); supabase.authenticateStudent.mockReset(); });

  it("does not read any temporary-password column when logging in (safe before the migration is applied)", async () => {
    queryRaw.mockResolvedValue([{ user_id: "user-1", auth_user_id: "auth-1", status: "active", account_state: "active", password_change_required: false, temporary_password_expires_at: null }]);
    supabase.authenticateStudent.mockResolvedValue({ access_token: "a", refresh_token: "r", expires_in: 3600, token_type: "bearer" });
    const result = await service.login({ schoolCode: "S", studentCode: "C", password: "existing-password-123" } as never);
    expect(result).toMatchObject({ password_change_required: false });
    const sql = (queryRaw.mock.calls[0][0] as { strings?: string[] } | TemplateStringsArray);
    const text = JSON.stringify(Array.isArray(sql) ? sql : (sql as { strings?: string[] }).strings ?? sql) + JSON.stringify(queryRaw.mock.calls[0].slice(1));
    expect(text).not.toMatch(/p2\.password_change_required|p3\.temporary_password_expires_at/);
  });

  it("refuses the first-login password change endpoint without touching the database", async () => {
    await expect(service.changeFirstLoginPassword({ vistaUserId: "u", authUserId: "a" } as never, { currentPassword: "x", newPassword: "y".repeat(14) })).rejects.toMatchObject({ status: 409 });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
