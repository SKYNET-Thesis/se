import { validateProductionConfig } from "./production-config";

const valid = {
  NODE_ENV: "production", DATABASE_URL: "postgresql://vista_app_runtime.project-ref:pass@db.example.com:5432/postgres?sslmode=require",
  DATABASE_RUNTIME_ROLE: "vista_app_runtime",
  SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-key",
  WEB_ORIGIN: "https://d111111abcdef8.cloudfront.net",
};

describe("production configuration", () => {
  it("accepts a complete TLS configuration", () => expect(() => validateProductionConfig(valid)).not.toThrow());
  it("rejects missing service role credentials", () => expect(() => validateProductionConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/));
  it("rejects a plaintext browser origin", () => expect(() => validateProductionConfig({ ...valid, WEB_ORIGIN: "http://example.com" })).toThrow(/WEB_ORIGIN/));
  it("rejects a database connection without mandatory TLS", () => expect(() => validateProductionConfig({ ...valid, DATABASE_URL: "postgresql://user:pass@db.example.com/postgres" })).toThrow(/DATABASE_URL/));
  it("rejects the postgres superuser connection even when TLS is enabled", () => expect(() => validateProductionConfig({ ...valid, DATABASE_URL: "postgresql://postgres.project-ref:pass@db.example.com:5432/postgres?sslmode=require" })).toThrow(/DATABASE_RUNTIME_ROLE/));
  it("requires a valid explicit runtime role", () => expect(() => validateProductionConfig({ ...valid, DATABASE_RUNTIME_ROLE: "" })).toThrow(/DATABASE_RUNTIME_ROLE/));
});
