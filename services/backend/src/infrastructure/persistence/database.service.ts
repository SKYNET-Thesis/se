import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";

@Injectable()
export class DatabaseService extends HealthIndicator implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    super();
    this.pool = new Pool({
      connectionString: config.get<string>("DATABASE_URL"),
      host: config.get<string>("POSTGRES_HOST", "localhost"),
      port: config.get<number>("POSTGRES_PORT", 5432),
      database: config.get<string>("POSTGRES_DB", "omniarm"),
      user: config.get<string>("POSTGRES_USER", "omniarm"),
      password: config.get<string>("POSTGRES_PASSWORD", "omniarm"),
    });
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query("SELECT 1");
      return this.getStatus("postgres", true);
    } catch {
      return this.getStatus("postgres", false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
