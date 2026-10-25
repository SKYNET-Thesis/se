import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "./auth/authenticated-user.interface";
import { IdentityService } from "./identity.service";

const currentUser: AuthenticatedUser = {
  authUserId: "auth-1",
  vistaUserId: "user-1",
  email: "login@example.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [],
};

const persistedUser = {
  id: "user-1",
  email: "student@example.test" as string | null,
  full_name: "Student One",
  status: "active",
  signup_method: "invited",
  email_verified_at: null,
  created_at: new Date("2026-10-01T00:00:00.000Z"),
  updated_at: new Date("2026-10-02T00:00:00.000Z"),
};

describe("IdentityService profile mapping", () => {
  const findUnique = jest.fn();
  const service = new IdentityService({ users: { findUnique } } as unknown as PrismaService);

  beforeEach(() => findUnique.mockReset());

  it("preserves a null email for a provisioned student profile", async () => {
    findUnique.mockResolvedValue({ ...persistedUser, email: null });

    await expect(service.getMe(currentUser)).resolves.toMatchObject({
      id: "user-1",
      email: null,
      fullName: "Student One",
    });
  });

  it("preserves the email for an email-backed profile", async () => {
    findUnique.mockResolvedValue(persistedUser);

    await expect(service.getMe(currentUser)).resolves.toMatchObject({
      id: "user-1",
      email: "student@example.test",
    });
  });
});
