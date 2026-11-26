import { PrismaClient } from "@prisma/client";

/**
 * Operator provisioning for WF-01: grant ONE organization an entitlement to ONE robot resource (and optionally register the robot first).
 * It generalizes seed-wf01-demo-robot.ts (which is hard-wired to VISTA Academy). It never creates or removes a classroom allocation, never edits
 * another organization's entitlement, and is a dry run unless --confirm is given.
 *
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --robot <uuid>                       (dry run)
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --robot <uuid> --confirm
 *   node dist/scripts/provision-robot-entitlement.js --organization <uuid> --register-serial SERIAL --name "Robot name" --confirm
 */
export type Plan = { organization: { id: string; name: string }; robot: { id: string | null; serialNo: string; willRegister: boolean }; entitlement: "exists" | "create"; allocations: number };
export interface ProvisioningStore {
  organization(id: string): Promise<{ id: string; name: string; status: string } | null>;
  robotById(id: string): Promise<{ id: string; serial_no: string } | null>;
  robotBySerial(serial: string): Promise<{ id: string; serial_no: string } | null>;
  entitlementExists(organizationId: string, robotId: string): Promise<boolean>;
  allocationCount(robotId: string): Promise<number>;
  registerRobot(serial: string, name: string): Promise<{ id: string; serial_no: string }>;
  createEntitlement(organizationId: string, robotId: string): Promise<void>;
}
export type Args = { organization: string; robot?: string; registerSerial?: string; name?: string; confirm: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseArgs(argv: string[]): Args {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const args: Args = { organization: get("--organization") ?? "", robot: get("--robot"), registerSerial: get("--register-serial"), name: get("--name"), confirm: argv.includes("--confirm") };
  if (!UUID.test(args.organization)) throw new Error("--organization must be an organization UUID.");
  if (Boolean(args.robot) === Boolean(args.registerSerial)) throw new Error("Give exactly one of --robot <uuid> or --register-serial <serial>.");
  if (args.robot && !UUID.test(args.robot)) throw new Error("--robot must be a robot UUID.");
  if (args.registerSerial && (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(args.registerSerial) || !args.name?.trim())) throw new Error("--register-serial needs a 3-64 character serial and --name.");
  return args;
}

export async function provision(store: ProvisioningStore, args: Args): Promise<{ plan: Plan; applied: boolean }> {
  const organization = await store.organization(args.organization);
  if (!organization) throw new Error("Organization was not found.");
  if (organization.status !== "active") throw new Error("Organization is not active.");
  let robot = args.robot ? await store.robotById(args.robot) : await store.robotBySerial(args.registerSerial!);
  if (args.robot && !robot) throw new Error("Robot was not found; use --register-serial to register a new robot resource.");
  const willRegister = !robot;
  const exists = robot ? await store.entitlementExists(organization.id, robot.id) : false;
  const allocations = robot ? await store.allocationCount(robot.id) : 0;
  const plan: Plan = { organization: { id: organization.id, name: organization.name }, robot: { id: robot?.id ?? null, serialNo: robot?.serial_no ?? args.registerSerial!, willRegister }, entitlement: exists ? "exists" : "create", allocations };
  if (!args.confirm) return { plan, applied: false };
  if (!robot) robot = await store.registerRobot(args.registerSerial!, args.name!.trim());
  if (!exists) await store.createEntitlement(organization.id, robot.id);
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
