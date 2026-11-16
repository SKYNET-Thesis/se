import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { assertSafeRuntimeRole } from "./database-role";

function withRequiredSsl(connectionUrl: string): string {
  const url = new URL(connectionUrl);
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionUrl = process.env.DATABASE_URL;
    super(connectionUrl ? { datasources: { db: { url: withRequiredSsl(connectionUrl) } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    const expectedRole = process.env.DATABASE_RUNTIME_ROLE ?? (process.env.NODE_ENV === "production" ? "vista_app_runtime" : undefined);
    if (!expectedRole) return;
    await this.$connect();
    try {
      const rows = await this.$queryRaw<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>`
        SELECT current_user AS current_user, r.rolsuper, r.rolbypassrls
        FROM pg_roles r WHERE r.rolname=current_user`;
      if (!rows[0]) throw new Error("PostgreSQL did not return the connected runtime role attributes.");
      assertSafeRuntimeRole({ currentUser: rows[0].current_user, superuser: rows[0].rolsuper, bypassRls: rows[0].rolbypassrls }, expectedRole);
    } catch (error) {
      await this.$disconnect();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
