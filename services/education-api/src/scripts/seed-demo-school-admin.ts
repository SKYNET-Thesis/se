import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const schoolAdminEmail = "school-admin@vista.demo";

async function main() {
  const [user, role, organization] = await Promise.all([
    prisma.users.findFirst({ where: { email: schoolAdminEmail }, select: { id: true } }),
    prisma.roles.findUnique({ where: { code: "school_admin" }, select: { id: true } }),
    prisma.organizations.findFirst({ where: { name: "VISTA Academy", type: "institution" }, select: { id: true } }),
  ]);
  if (!user) throw new Error(`Missing ${schoolAdminEmail}; run seed:demo-identities first.`);
  if (!role) throw new Error("Missing school_admin role; apply 20261021_school_administration first.");
  if (!organization) throw new Error("Missing VISTA Academy organization; run seed:demo-delivery first.");

  await prisma.memberships.upsert({
    where: { user_id_organization_id: { user_id: user.id, organization_id: organization.id } },
    update: { role_id: role.id, status: "active" },
    create: { user_id: user.id, organization_id: organization.id, role_id: role.id, status: "active" },
  });
  console.log(`${schoolAdminEmail} is an active school_admin for VISTA Academy.`);
}

void main().finally(() => prisma.$disconnect());
