import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

function withRequiredSsl(connectionUrl: string): string {
  const url = new URL(connectionUrl);
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionUrl = process.env.DATABASE_URL;
    super(connectionUrl ? { datasources: { db: { url: withRequiredSsl(connectionUrl) } } } : undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
