import { modelAccess, stripOwnerReferences } from "./model-access";

const user = (over: { systemPermissions?: string[]; memberships?: Array<{ roleCode: string; status?: string; permissions?: string[] }> }) => ({
  authUserId: "a", vistaUserId: "u", email: "u@test", status: "active", systemRoleCodes: [],
  systemPermissions: over.systemPermissions ?? [],
  memberships: (over.memberships ?? []).map((m, i) => ({ id: `m${i}`, organizationId: "org", roleCode: m.roleCode, status: m.status ?? "active", permissions: m.permissions ?? [] })),
});

describe("modelAccess (SRS UC-08 actors)", () => {
  it("gives System Administrators and model.use holders the existing full access", () => {
    expect(modelAccess(user({ systemPermissions: ["org.manage"] }))).toBe("full");
    expect(modelAccess(user({ systemPermissions: ["model.use"] }))).toBe("full");
    expect(modelAccess(user({ memberships: [{ roleCode: "student", permissions: ["model.use"] }] }))).toBe("full");
  });

  it("gives an active Student or Teacher read access to public metadata only", () => {
    expect(modelAccess(user({ memberships: [{ roleCode: "student" }] }))).toBe("public");
    expect(modelAccess(user({ memberships: [{ roleCode: "instructor" }] }))).toBe("public");
    expect(modelAccess(user({ memberships: [{ roleCode: "teacher" }] }))).toBe("public");
  });

  it("does not turn public access into model.use: other permissions and suspended memberships do not widen it", () => {
    expect(modelAccess(user({ memberships: [{ roleCode: "student", permissions: ["learning.experiment.execute", "learning.work.write"] }] }))).toBe("public");
    expect(modelAccess(user({ memberships: [{ roleCode: "student", status: "suspended", permissions: ["model.use"] }] }))).toBe("none");
    expect(modelAccess(user({ memberships: [{ roleCode: "instructor", status: "invited" }] }))).toBe("none");
  });

  it("keeps the registry closed to every other caller", () => {
    expect(modelAccess(user({ memberships: [{ roleCode: "school_admin" }] }))).toBe("none");
    expect(modelAccess(user({ memberships: [{ roleCode: "teaching_assistant" }] }))).toBe("none");
    expect(modelAccess(user({}))).toBe("none");
    expect(modelAccess(user({ memberships: [{ roleCode: "school_admin" }, { roleCode: "student" }] }))).toBe("public");   // any one eligible role is enough
  });

  it("never mutates the caller's permissions", () => {
    const caller = user({ memberships: [{ roleCode: "student", permissions: ["learning.work.write"] }] });
    const before = JSON.stringify(caller);
    modelAccess(caller);
    expect(JSON.stringify(caller)).toBe(before);
    expect(caller.memberships[0].permissions).not.toContain("model.use");
  });
});

describe("stripOwnerReferences", () => {
  it("removes the internal owner references and keeps the card fields", () => {
    expect(stripOwnerReferences({ id: "m", name: "n", owner_type: "system", owner_organization_id: "o", owner_user_id: "u", visibility: "public" })).toEqual({ id: "m", name: "n", owner_type: "system", visibility: "public" });
  });
});
