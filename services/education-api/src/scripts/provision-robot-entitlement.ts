import { PrismaClient } from "@prisma/client";

/**
 * Operator provisioning for WF-01: grant ONE organization an entitlement to ONE robot resource (and optionally register the robot first).
 * It generalizes seed-wf01-demo-robot.ts (which is hard-wired to VISTA Academy). It never creates or removes a classroom allocation, never edits
 * another organization's entitlement, and is a dry run unless --confirm is given.
 *
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --robot <uuid>                       (dry run)
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --robot <uuid> --confirm
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --register-serial SERIAL --name "Robot name" --confirm
 *
 * Commissioning isolation (reversible, never deletes an allocation or entitlement): add --isolate-others to also END (valid_to=now) the active
 * entitlements that OTHER organizations hold for the same robot. Their classroom allocation rows stay untouched, but the Education API then
 * answers ROBOT_ENTITLEMENT_INVALID for their students. Restore with:
 *   node dist/scripts/provision-robot-entitlement.js --restore <entitlement uuid> [--confirm]
 *
 * Student authorization: --blockly-student <user uuid> gives ONE student of the organization the existing `student-blockly-demo` safety profile
 * (allowed mode blockly), the only way a student can pass the Blockly-mode check of the physical/IoT start. Undo with --clear-blockly-student.
 */
export type Isolated = { id: string; organizationId: string; validTo: string | null };
export type Plan = { organization: { id: string; name: string }; robot: { id: string | null; serialNo: string; willRegister: boolean }; entitlement: "exists" | "create"; allocations: number; isolate?: Isolated[]; restore?: { id: string; action: "clear valid_to" }; blocklyStudent?: { userId: string; membershipId: string; previousProfileId: string | null } };
export interface ProvisioningStore {
  organization(id: string): Promise<{ id: string; name: string; status: string } | null>;
  robotById(id: string): Promise<{ id: string; serial_no: string } | null>;
  robotBySerial(serial: string): Promise<{ id: string; serial_no: string } | null>;
  entitlementExists(organizationId: string, robotId: string): Promise<boolean>;
  allocationCount(robotId: string): Promise<number>;
  registerRobot(serial: string, name: string): Promise<{ id: string; serial_no: string }>;
  createEntitlement(organizationId: string, robotId: string): Promise<void>;
  activeEntitlementsOfOthers(robotId: string, exceptOrganizationId: string): Promise<Array<{ id: string; organization_id: string }>>;
  setEntitlementEnd(id: string, validTo: Date | null): Promise<void>;
  entitlementById(id: string): Promise<{ id: string; organization_id: string; valid_to: Date | null } | null>;
  studentMembership(organizationId: string, userId: string): Promise<{ id: string; safety_profile_id: string | null } | null>;
  blocklyProfileId(): Promise<string | null>;
  setMembershipProfile(membershipId: string, profileId: string | null): Promise<void>;
}
export type Args = { blocklyStudent?: string; clearBlocklyStudent?: string; organization: string; robot?: string; registerSerial?: string; name?: string; confirm: boolean; isolateOthers?: boolean; restore?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseArgs(argv: string[]): Args {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const restore = get("--restore");
  if (restore) {
    if (!UUID.test(restore)) throw new Error("--restore must be an entitlement UUID.");
    return { organization: "", restore, confirm: argv.includes("--confirm") };
  }
  const args: Args = { blocklyStudent: get("--blockly-student"), clearBlocklyStudent: get("--clear-blockly-student"), organization: get("--organization") ?? "", robot: get("--robot"), registerSerial: get("--register-serial"), name: get("--name"), confirm: argv.includes("--confirm"), isolateOthers: argv.includes("--isolate-others") };
  if (!UUID.test(args.organization)) throw new Error("--organization must be an organization UUID.");
  for (const [flag, value] of [["--blockly-student", args.blocklyStudent], ["--clear-blockly-student", args.clearBlocklyStudent]] as const) if (value && !UUID.test(value)) throw new Error(`${flag} must be a user UUID.`);
  if (args.blocklyStudent || args.clearBlocklyStudent) { if (args.robot || args.registerSerial) throw new Error("Student profile changes are a separate invocation from robot provisioning."); return args; }
  if (Boolean(args.robot) === Boolean(args.registerSerial)) throw new Error("Give exactly one of --robot <uuid> or --register-serial <serial>.");
  if (args.robot && !UUID.test(args.robot)) throw new Error("--robot must be a robot UUID.");
  if (args.registerSerial && (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(args.registerSerial) || !args.name?.trim())) throw new Error("--register-serial needs a 3-64 character serial and --name.");
  return args;
}

export async function provision(store: ProvisioningStore, args: Args): Promise<{ plan: Plan; applied: boolean }> {
  if (args.restore) {
    const row = await store.entitlementById(args.restore);
    if (!row) throw new Error("Entitlement was not found.");
    const restorePlan: Plan = { organization: { id: row.organization_id, name: "" }, robot: { id: null, serialNo: "", willRegister: false }, entitlement: "exists", allocations: 0, restore: { id: row.id, action: "clear valid_to" } };
    if (!args.confirm) return { plan: restorePlan, applied: false };
    await store.setEntitlementEnd(row.id, null);
    return { plan: restorePlan, applied: true };
  }
  const organization = await store.organization(args.organization);
  if (!organization) throw new Error("Organization was not found.");
  if (organization.status !== "active") throw new Error("Organization is not active.");
  if (args.blocklyStudent || args.clearBlocklyStudent) {
    const userId = (args.blocklyStudent ?? args.clearBlocklyStudent)!;
    const membership = await store.studentMembership(organization.id, userId);
    if (!membership) throw new Error("The user is not a student member of this organization.");
    const profileId = args.blocklyStudent ? await store.blocklyProfileId() : null;
    if (args.blocklyStudent && !profileId) throw new Error("The student-blockly-demo safety profile does not exist.");
    const studentPlan: Plan = { organization: { id: organization.id, name: organization.name }, robot: { id: null, serialNo: "", willRegister: false }, entitlement: "exists", allocations: 0, blocklyStudent: { userId, membershipId: membership.id, previousProfileId: membership.safety_profile_id } };
    if (!args.confirm) return { plan: studentPlan, applied: false };
    await store.setMembershipProfile(membership.id, profileId);
    return { plan: studentPlan, applied: true };
  }
  let robot = args.robot ? await store.robotById(args.robot) : await store.robotBySerial(args.registerSerial!);
  if (args.robot && !robot) throw new Error("Robot was not found; use --register-serial to register a new robot resource.");
  const willRegister = !robot;
  const exists = robot ? await store.entitlementExists(organization.id, robot.id) : false;
  const allocations = robot ? await store.allocationCount(robot.id) : 0;
  const plan: Plan = { organization: { id: organization.id, name: organization.name }, robot: { id: robot?.id ?? null, serialNo: robot?.serial_no ?? args.registerSerial!, willRegister }, entitlement: exists ? "exists" : "create", allocations };
  if (args.isolateOthers && robot) plan.isolate = (await store.activeEntitlementsOfOthers(robot.id, organization.id)).map((row) => ({ id: row.id, organizationId: row.organization_id, validTo: null }));
  if (!args.confirm) return { plan, applied: false };
  if (!robot) robot = await store.registerRobot(args.registerSerial!, args.name!.trim());
  if (!exists) await store.createEntitlement(organization.id, robot.id);
  if (plan.isolate) for (const row of plan.isolate) await store.setEntitlementEnd(row.id, new Date());
  plan.robot.id = robot.id;
  return { plan, applied: true };
}

function prismaStore(prisma: PrismaClient): ProvisioningStore {
  const resourceType = async () => {
    const existing = await prisma.org_entitlements.findMany({ where: { robot_id: { not: null } }, distinct: ["resource_type"], select: { resource_type: true } });
    if (existing.some((item) => item.resource_type === "robot")) return "robot";
    throw new Error("No verified robot resource_type exists in the live database; refusing to guess an entitlement value.");
  };
  return {
    organization: (id) => prisma.organizations.findUnique({ where: { id }, select: { id: true, name: true, status: true } }) as never,
    robotById: (id) => prisma.robots.findUnique({ where: { id }, select: { id: true, serial_no: true } }),
    robotBySerial: (serial) => prisma.robots.findUnique({ where: { serial_no: serial }, select: { id: true, serial_no: true } }),
    entitlementExists: async (organizationId, robotId) => (await prisma.org_entitlements.count({ where: { organization_id: organizationId, robot_id: robotId } })) > 0,
    allocationCount: (robotId) => prisma.learning_classroom_robot_allocations.count({ where: { robot_id: robotId } }),
    registerRobot: (serial, name) => prisma.robots.create({ data: { serial_no: serial, name, notes: "Registered by provision-robot-entitlement. Resource record only: it does not represent hardware readiness or execution authorization." }, select: { id: true, serial_no: true } }),
    activeEntitlementsOfOthers: (robotId, exceptOrganizationId) => prisma.org_entitlements.findMany({ where: { robot_id: robotId, resource_type: "robot", organization_id: { not: exceptOrganizationId }, valid_to: null }, select: { id: true, organization_id: true } }),
    setEntitlementEnd: async (id, validTo) => { await prisma.org_entitlements.update({ where: { id }, data: { valid_to: validTo } }); },
    studentMembership: async (organizationId, userId) => (await prisma.memberships.findFirst({ where: { organization_id: organizationId, user_id: userId, status: "active", roles: { is: { code: "student" } } }, select: { id: true, safety_profile_id: true } })) as never,
    blocklyProfileId: async () => (await prisma.safety_profiles.findUnique({ where: { name: "student-blockly-demo" }, select: { id: true } }))?.id ?? null,
    setMembershipProfile: async (membershipId, profileId) => { await prisma.memberships.update({ where: { id: membershipId }, data: { safety_profile_id: profileId } }); },
    entitlementById: (id) => prisma.org_entitlements.findUnique({ where: { id }, select: { id: true, organization_id: true, valid_to: true } }),
    createEntitlement: async (organizationId, robotId) => { await prisma.org_entitlements.create({ data: { organization_id: organizationId, robot_id: robotId, resource_type: await resourceType(), valid_from: new Date(), valid_to: null } }); },
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await provision(prismaStore(prisma), parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ mode: result.applied ? "applied" : "dry-run (add --confirm to apply)", ...result.plan }, null, 2));
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
