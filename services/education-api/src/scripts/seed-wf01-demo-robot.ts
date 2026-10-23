import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const organizationId = "a6a03387-bae6-4a8f-947d-298ea828a935";
const organizationName = "VISTA Academy";
const serialNo = "VISTA-WF01-DEMO-ROBOT-01";

async function verifiedRobotResourceType() {
  const existing = await prisma.org_entitlements.findMany({
    where: { robot_id: { not: null } },
    distinct: ["resource_type"],
    select: { resource_type: true },
  });
  if (existing.some((item) => item.resource_type === "robot")) return "robot";

  const checks = await prisma.$queryRaw<{ definition: string }[]>`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.org_entitlements'::regclass AND contype = 'c'`;
  if (checks.some((item) => /resource_type[\s\S]*'robot'|'robot'[\s\S]*resource_type/i.test(item.definition))) return "robot";

  throw new Error("No verified robot resource_type exists in the live database; refusing to guess an entitlement value.");
}

async function main() {
  const organization = await prisma.organizations.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization || organization.name !== organizationName) throw new Error("Expected VISTA Academy organization was not found.");

  const resourceType = await verifiedRobotResourceType();
  const robot = await prisma.robots.upsert({
    where: { serial_no: serialNo },
    update: {
      name: "VISTA Classroom Demo Robot Resource",
      notes: "WF-01 demo allocation resource only. It does not represent physical hardware readiness, runtime availability, or execution authorization.",
    },
    create: {
      serial_no: serialNo,
      name: "VISTA Classroom Demo Robot Resource",
      notes: "WF-01 demo allocation resource only. It does not represent physical hardware readiness, runtime availability, or execution authorization.",
    },
    select: { id: true, name: true, serial_no: true, status: true },
  });

  const current = await prisma.org_entitlements.findFirst({
    where: { organization_id: organization.id, robot_id: robot.id, resource_type: resourceType },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  const entitlement = current
    ? await prisma.org_entitlements.update({ where: { id: current.id }, data: { valid_from: new Date(), valid_to: null }, select: { id: true } })
    : await prisma.org_entitlements.create({ data: { organization_id: organization.id, robot_id: robot.id, resource_type: resourceType, valid_from: new Date(), valid_to: null }, select: { id: true } });

  console.log(JSON.stringify({ organizationId: organization.id, robot, entitlementId: entitlement.id, resourceType }, null, 2));
}

void main().finally(() => prisma.$disconnect());
