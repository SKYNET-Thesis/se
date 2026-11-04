import { createHash } from "node:crypto";
import { StudentProvisioningService } from "./student-provisioning.service";

describe("StudentProvisioningService", () => {
  const txQueryRaw = jest.fn();
  const txExecuteRaw = jest.fn();
  const transaction = jest.fn();
  const service = new StudentProvisioningService({ $transaction: transaction } as never);

  beforeEach(() => {
    txQueryRaw.mockReset().mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("education_school_user_profiles")) return [];
      if (query.includes("INSERT INTO public.users")) return [{ id: "user-new" }];
      if (query.includes("INSERT INTO public.memberships")) return [{ id: "membership-new" }];
      return [];
    });
    txExecuteRaw.mockReset().mockResolvedValue(1);
    transaction.mockReset().mockImplementation(async callback => callback({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw }));
  });

  it("provisions a student without an auth email and returns a one-time setup code", async () => {
    const result = await service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" }, "class-a");

    expect(result).toMatchObject({ userId: "user-new", status: "created", setupCode: expect.any(String) });
    expect(transaction).toHaveBeenCalledTimes(1);
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
      ? [{ user_id: "user-existing", auth_user_id: null, auth_identifier: "identity-existing", account_state: "account_setup_pending", has_live_setup_code: true }]
      : []);

    await expect(service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" })).resolves.toEqual({
      userId: "user-existing",
      status: "unchanged",
      setupCode: undefined,
    });
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });

  it("adds an existing student idempotently without changing the master profile", async () => {
    await service.addExistingStudentToClassroom({ userId: "user-existing", membershipId: "membership-existing" }, "class-b");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw.mock.calls[0].join(" ")).toContain("learning_classroom_members");
  });
});
