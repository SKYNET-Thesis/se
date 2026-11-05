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
  `;

  let migrated = 0;
  for (const student of students) {
    const internalEmail = `student-${student.id}@students.auth.vista.invalid`;
    await supabaseAdmin.replaceStudentLoginEmail(student.auth_user_id, internalEmail);
    migrated += 1;
  }

  console.log(`Migrated ${migrated} linked student identities to aliases derived from VISTA user IDs.`);
}

main()
  .catch(() => {
    console.error("Student identity migration failed. Check server-side configuration and Supabase connectivity.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());