import { createHash } from "node:crypto";
import { StudentProvisioningService } from "./student-provisioning.service";

describe("StudentProvisioningService", () => {
  const txQueryRaw = jest.fn();
  const txExecuteRaw = jest.fn();
  const transaction = jest.fn();
  const supabase = { createStudentIdentityIfMissing: jest.fn(), setStudentPassword: jest.fn(), deleteStudentIdentity: jest.fn() };
  const config = { get: jest.fn().mockReturnValue("false") };
  const service = new StudentProvisioningService({ $transaction: transaction, $queryRaw: jest.fn(), $executeRaw: jest.fn() } as never, supabase as never, config as never);

  beforeEach(() => {
    txQueryRaw.mockReset().mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT user_id FROM public.education_school_user_profiles")) return [{ user_id: "user-new" }];
      if (query.includes("education_school_user_profiles")) return [];
      if (query.includes("INSERT INTO public.users")) return [{ id: "user-new" }];
      if (query.includes("INSERT INTO public.memberships")) return [{ id: "membership-new" }];
      return [];
    });
    txExecuteRaw.mockReset().mockResolvedValue(1);
    transaction.mockReset().mockImplementation(async callback => callback({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw }));
    config.get.mockReset().mockReturnValue("false");
    supabase.createStudentIdentityIfMissing.mockReset().mockResolvedValue({ user: { id: "auth-new" }, created: true });
    supabase.setStudentPassword.mockReset().mockResolvedValue(undefined);
    supabase.deleteStudentIdentity.mockReset().mockResolvedValue(undefined);
  });

  it("provisions a student without an auth email and returns a one-time setup code", async () => {
    const result = await service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" }, "class-a");

    expect(result).toMatchObject({ userId: "user-new", status: "created", setupCode: expect.any(String) });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQueryRaw.mock.calls[0][0].join(" ")).toContain("SELECT 1 FROM pg_advisory_xact_lock");
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("account_setup_pending");
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("learning_classroom_members");
    const tokenQuery = txExecuteRaw.mock.calls.find(call => call[0].join(" ").includes("auth_tokens"));
    expect(tokenQuery).toBeDefined();
    expect(tokenQuery).not.toContain(result.setupCode);
    expect(tokenQuery?.[2]).toBe(createHash("sha256").update(result.setupCode as string).digest("hex"));
    expect(tokenQuery?.[3]).toBeInstanceOf(Date);
  });

  it("does not rotate an unexpired setup code on student re-import", async () => {
    txQueryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join(" ").includes("education_school_user_profiles")
      ? [{ user_id: "user-existing", auth_user_id: null, account_state: "account_setup_pending", has_live_setup_code: true }]
      : []);

    await expect(service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" })).resolves.toEqual({
      userId: "user-existing",
      status: "unchanged",
      setupCode: undefined,
    });
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });


  it("creates a real Supabase temporary password only for a new student when rollout is enabled", async () => {
    config.get.mockReturnValue("true");
    const result = await service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" });
    expect(result).toMatchObject({ userId: "user-new", status: "created", temporaryPassword: expect.any(String), temporaryPasswordExpiresAt: expect.any(String) });
    expect((result.temporaryPassword as string).length).toBeGreaterThanOrEqual(32);
    expect(supabase.createStudentIdentityIfMissing).toHaveBeenCalledWith("student-user-new@students.auth.vista.invalid", result.temporaryPassword);
    expect(txExecuteRaw.mock.calls.flat()).not.toContain(result.temporaryPassword);
    expect(txQueryRaw.mock.calls.flat()).not.toContain(result.temporaryPassword);
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("password_change_required=true");
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("temporary_password_expires_at");
  });

  it("does not rotate an existing active student's password on repeated import", async () => {
    config.get.mockReturnValue("true");
    txQueryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join(" ").includes("education_school_user_profiles")
      ? [{ user_id: "user-active", auth_user_id: "auth-active", account_state: "active", has_live_setup_code: false, password_change_required: false }]
      : []);
    await expect(service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" })).resolves.toMatchObject({ status: "unchanged", userId: "user-active" });
    expect(supabase.createStudentIdentityIfMissing).not.toHaveBeenCalled();
    expect(supabase.setStudentPassword).not.toHaveBeenCalled();
  });

  it("does not hand out a credential when Supabase provisioning fails", async () => {
    config.get.mockReturnValue("true");
    supabase.createStudentIdentityIfMissing.mockRejectedValue(new Error("provider unavailable"));
    await expect(service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" })).rejects.toThrow("provider unavailable");
    expect(txExecuteRaw.mock.calls.flat().join(" ")).not.toContain("password_change_required=true");
  });

  it("adds an existing student idempotently without changing the master profile", async () => {
    await service.addExistingStudentToClassroom({ userId: "user-existing", membershipId: "membership-existing" }, "class-b");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw.mock.calls[0].join(" ")).toContain("learning_classroom_members");
  });
});
