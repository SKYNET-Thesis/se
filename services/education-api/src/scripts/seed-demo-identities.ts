import { PrismaClient } from "@prisma/client";

type DemoIdentity = {
  key: "ADMIN" | "INSTRUCTOR" | "STUDENT";
  email: string;
  fullName: string;
};

type SupabaseUser = { id: string; email?: string };

const demoIdentities: DemoIdentity[] = [
  { key: "ADMIN", email: "admin@vista.demo", fullName: "VISTA Demo Admin" },
  { key: "INSTRUCTOR", email: "instructor@vista.demo", fullName: "VISTA Demo Instructor" },
  { key: "STUDENT", email: "student@vista.demo", fullName: "VISTA Demo Student" },
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured before seeding demo identities.`);
  return value;
}

async function request<T>(url: string, serviceRoleKey: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase Admin API failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function findOrCreate(identity: DemoIdentity, baseUrl: string, serviceRoleKey: string): Promise<SupabaseUser> {
  const users = await request<{ users: SupabaseUser[] }>(`${baseUrl}/auth/v1/admin/users?page=1&per_page=1000`, serviceRoleKey, { method: "GET" });
  const existing = users.users.find((user) => user.email?.toLowerCase() === identity.email);
  if (existing) return existing;

  const password = required(`VISTA_DEMO_${identity.key}_PASSWORD`);
  const created = await request<SupabaseUser>(`${baseUrl}/auth/v1/admin/users`, serviceRoleKey, {
    method: "POST",
    body: JSON.stringify({ email: identity.email, password, email_confirm: true, user_metadata: { full_name: identity.fullName } }),
  });
  return created;
}

async function main(): Promise<void> {
  const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  for (const identity of demoIdentities) required(`VISTA_DEMO_${identity.key}_PASSWORD`);
  const prisma = new PrismaClient();

  try {
    for (const identity of demoIdentities) {
      const authUser = await findOrCreate(identity, baseUrl, serviceRoleKey);
      const rows = await prisma.$queryRaw<{ id: string; email: string }[]>`
        SELECT id, email FROM public.users WHERE auth_user_id = ${authUser.id}::uuid LIMIT 1
      `;
      if (!rows[0]) {
        throw new Error(`${identity.email} exists in Supabase Auth but was not provisioned in public.users. Apply the auth provisioning trigger before retrying.`);
      }
      console.log(`${identity.email}: ${rows[0].id}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
