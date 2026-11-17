import { Controller, Get } from "@nestjs/common";

export interface BuildVersion { service: "vista-education-api"; gitSha: string }

/** The Git commit baked into the image (Docker build arg GIT_SHA); anything that is not a full lowercase SHA-1 is reported as "unknown". */
export function buildVersion(env: NodeJS.ProcessEnv = process.env): BuildVersion {
  const sha = env.GIT_SHA ?? "";
  return { service: "vista-education-api", gitSha: /^[0-9a-f]{40}$/.test(sha) ? sha : "unknown" };
}

/** Unauthenticated and deliberately minimal: deployment verification needs the commit, nothing else (no environment, no dependency versions). */
@Controller()
export class VersionController {
  @Get("version")
  version(): BuildVersion {
    return buildVersion();
  }
}
