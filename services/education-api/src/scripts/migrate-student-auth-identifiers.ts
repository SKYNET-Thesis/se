import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../modules/education-admin/supabase-admin.service";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl || !supabaseUrl || !serviceRole) {
  throw new Error("DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const prisma = new PrismaClient();
const supabaseAdmin = new SupabaseAdminService(new ConfigService({ SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRole }));

async function main() {
  const students = await prisma.$queryRaw<Array<{ id: string; auth_user_id: string }>>`
    SELECT DISTINCT u.id, u.auth_user_id
    FROM public.users u
    JOIN public.education_school_user_profiles p ON p.user_id=u.id
    WHERE p.person_type='student'
      AND u.auth_user_id IS NOT NULL
      AND u.auth_identifier IS NULL
  `;

  let migrated = 0;
  for (const student of students) {
    const identifier = randomUUID();
    const internalEmail = `student-${identifier}@students.auth.vista.invalid`;
    await supabaseAdmin.replaceStudentLoginEmail(student.auth_user_id, internalEmail);

    const updated = await prisma.$executeRaw`
      UPDATE public.users SET auth_identifier=${identifier}::uuid
      WHERE id=${student.id}::uuid AND auth_user_id=${student.auth_user_id}::uuid AND auth_identifier IS NULL`;
    if (updated !== 1) throw new Error("Student identity mapping changed during migration.");
    migrated += 1;
  }

  console.log(`Migrated ${migrated} linked student identities to internal login aliases.`);
}

main()
  .catch(() => {
    console.error("Student identity migration failed. Check server-side configuration and Supabase connectivity.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());