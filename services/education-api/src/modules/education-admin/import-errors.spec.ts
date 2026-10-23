import { classifyImportError, ImportProvisioningError } from "./import-errors";

describe("safe school import errors", () => {
  it("returns a safe invite failure without leaking Supabase details", () => {
    const result = classifyImportError(new ImportProvisioningError("ACCOUNT_INVITE_FAILED", "smtp failure from Supabase"));
    expect(result).toEqual({ code: "ACCOUNT_INVITE_FAILED", message: "Account invitation could not be sent. Please try again." });
    expect(JSON.stringify(result)).not.toMatch(/Supabase|smtp/i);
  });

  it.each(["Invalid `prisma.$queryRaw()` invocation", "ERROR 23514 users_signup_method_check", "SELECT * FROM public.users"])("hides raw database failure: %s", raw => {
    const result = classifyImportError(new Error(raw));
    expect(result).toEqual({ code: "DATABASE_WRITE_FAILED", message: "We couldn't save this user. Please try again." });
    expect(JSON.stringify(result)).not.toContain(raw);
  });
});
