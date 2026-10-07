import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

@Injectable()
export class HealthRepository implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get<string>("DATABASE_URL"),
      host: config.get<string>("POSTGRES_HOST", "localhost"),
      port: config.get<number>("POSTGRES_PORT", 5432),
      database: config.get<string>("POSTGRES_DB", "omniarm"),
      user: config.get<string>("POSTGRES_USER", "omniarm"),
      password: config.get<string>("POSTGRES_PASSWORD", "omniarm"),
    });
  }

  async canConnect(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
