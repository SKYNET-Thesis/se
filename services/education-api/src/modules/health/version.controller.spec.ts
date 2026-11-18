import { buildVersion, VersionController } from "./version.controller";

describe("VersionController", () => {
  const sha = "0eb33dfd2d2d3b1d8e8b8d6f2b9d1f0c8f5b4a3e";
  it("reports the commit baked into the image", () => {
    expect(buildVersion({ GIT_SHA: sha } as NodeJS.ProcessEnv)).toEqual({ service: "vista-education-api", gitSha: sha });
  });
  it("never echoes anything that is not a full lowercase SHA-1", () => {
    for (const value of [undefined, "", "unknown", "main", sha.toUpperCase(), sha.slice(0, 7), `${sha}\nSECRET=1`, "<script>"]) {
      expect(buildVersion({ GIT_SHA: value } as NodeJS.ProcessEnv).gitSha).toBe("unknown");
    }
  });
  it("exposes only the service name and the commit", () => {
    process.env.GIT_SHA = sha;
    try { expect(Object.keys(new VersionController().version()).sort()).toEqual(["gitSha", "service"]); } finally { delete process.env.GIT_SHA; }
  });
});
