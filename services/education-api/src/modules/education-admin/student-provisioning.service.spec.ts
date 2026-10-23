import { StudentProvisioningService } from "./student-provisioning.service";

describe("StudentProvisioningService", () => {
  const txQueryRaw = jest.fn();
  const txExecuteRaw = jest.fn();
  const transaction = jest.fn();
  const invite = jest.fn();
  const service = new StudentProvisioningService({ $transaction: transaction } as never, { invite } as never);

  beforeEach(() => {
    txQueryRaw.mockReset().mockResolvedValue([{ id: "user-new" }]);
    txExecuteRaw.mockReset().mockResolvedValue(1);
    transaction.mockReset().mockImplementation(async callback => callback({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw }));
    invite.mockReset();
  });

  it("provisions a no-email student and classroom membership in one DB transaction", async () => {
    const result = await service.provision("school-a", { firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" }, "class-a");

    expect(result).toEqual({ userId: "user-new" });
    expect(invite).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txQueryRaw.mock.calls[0]).toContain(null);
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("account_setup_pending");
    expect(txExecuteRaw.mock.calls.flat().join(" ")).toContain("learning_classroom_members");
  });

  it("uses the existing idempotent Supabase invitation path for an email student", async () => {
    invite.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010" });
    await service.provision("school-a", { firstName: "Minh", lastName: "Khoa", studentCode: "S2", gradeLevel: "Grade 7", email: "MINH@example.com" }, "class-a");
    expect(invite).toHaveBeenCalledWith("minh@example.com", "Minh Khoa");
  });

  it("does not start a DB transaction or create classroom membership when invitation fails", async () => {
    invite.mockRejectedValue(new Error("provider failure"));
    await expect(service.provision("school-a", { firstName: "Minh", lastName: "Khoa", studentCode: "S2", gradeLevel: "Grade 7", email: "minh@example.com" }, "class-a")).rejects.toThrow("provider failure");
    expect(transaction).not.toHaveBeenCalled();
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });

  it("adds an existing student idempotently without changing the master profile", async () => {
    await service.addExistingStudentToClassroom({ userId: "user-existing", membershipId: "membership-existing" }, "class-b");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw.mock.calls[0].join(" ")).toContain("learning_classroom_members");
  });
});
