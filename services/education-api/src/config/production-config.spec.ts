import { validateProductionConfig } from "./production-config";

const valid = {
  NODE_ENV: "production", DATABASE_URL: "postgresql://vista_app_runtime.project-ref:pass@db.example.com:5432/postgres?sslmode=require",
  DATABASE_RUNTIME_ROLE: "vista_app_runtime",
  SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-value-abcdef0123456789", SUPABASE_ANON_KEY: "anon-public-value-abcdef0123456789",
  LEARNING_MEDIA_BUCKET: "vista-learning-media", AWS_REGION: "ap-southeast-1", TRUST_PROXY: "1",
  WEB_ORIGIN: "https://d111111abcdef8.cloudfront.net",
};

describe("production configuration", () => {
  it.each([undefined, "", "disabled", "always", "2026-12-01T00:00:00Z"])("accepts prerequisite enforcement setting %p", (value) => expect(() => validateProductionConfig({ ...valid, ...(value === undefined ? {} : { COURSE_PREREQUISITES_ENFORCED_FROM: value }) })).not.toThrow());
  it.each([undefined, "", "simulation"])("accepts IoT start mode %p when its prerequisites are present", (mode) => expect(() => validateProductionConfig({ ...valid, VISTA_IOT_START_MODE: mode, VISTA_IOT_THING_PREFIX: "vista-demo" })).not.toThrow());
  it("rejects any IoT start mode other than simulation (no physical student start through IoT)", () => expect(() => validateProductionConfig({ ...valid, VISTA_IOT_START_MODE: "physical" })).toThrow(/VISTA_IOT_START_MODE/));
  it("requires the Thing prefix for the simulation start mode", () => expect(() => validateProductionConfig({ ...valid, VISTA_IOT_START_MODE: "simulation" })).toThrow(/VISTA_IOT_THING_PREFIX/));
  it("accepts a complete TLS configuration", () => expect(() => validateProductionConfig(valid)).not.toThrow());
  it("rejects missing service role credentials", () => expect(() => validateProductionConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/));
  it("rejects a plaintext browser origin", () => expect(() => validateProductionConfig({ ...valid, WEB_ORIGIN: "http://example.com" })).toThrow(/WEB_ORIGIN/));
  it("rejects a database connection without mandatory TLS", () => expect(() => validateProductionConfig({ ...valid, DATABASE_URL: "postgresql://user:pass@db.example.com/postgres" })).toThrow(/DATABASE_URL/));
  it("rejects the postgres superuser connection even when TLS is enabled", () => expect(() => validateProductionConfig({ ...valid, DATABASE_URL: "postgresql://postgres.project-ref:pass@db.example.com:5432/postgres?sslmode=require" })).toThrow(/DATABASE_RUNTIME_ROLE/));
  it("requires a valid explicit runtime role", () => expect(() => validateProductionConfig({ ...valid, DATABASE_RUNTIME_ROLE: "" })).toThrow(/DATABASE_RUNTIME_ROLE/));
  it.each([
    ["the public Supabase key", { SUPABASE_ANON_KEY: "" }, /SUPABASE_ANON_KEY/],
    ["the media bucket", { LEARNING_MEDIA_BUCKET: "" }, /LEARNING_MEDIA_BUCKET/],
    ["the AWS region", { AWS_REGION: "" }, /AWS_REGION/],
    ["proxy trust (rate limits)", { TRUST_PROXY: "" }, /TRUST_PROXY/],
    ["a non-numeric proxy trust", { TRUST_PROXY: "true" }, /TRUST_PROXY/],
    ["a local S3 endpoint override", { LEARNING_MEDIA_S3_ENDPOINT: "http://127.0.0.1:59000" }, /LEARNING_MEDIA_S3_ENDPOINT/],
    ["a malformed temporary-password flag", { STUDENT_TEMP_PASSWORD_ENABLED: "yes" }, /STUDENT_TEMP_PASSWORD_ENABLED/],
    ["a non-loopback Twin address", { DIGITAL_TWIN_TELEMETRY_URL: "https://twin.example.com", DIGITAL_TWIN_SCOPE_SECRET: "x".repeat(40) }, /loopback/],
    ["a Twin host that only starts with the container name", { DIGITAL_TWIN_TELEMETRY_URL: "http://vista-digital-twin.evil.example:8767", DIGITAL_TWIN_SCOPE_SECRET: "x".repeat(40) }, /loopback/],
    ["a Twin address with userinfo", { DIGITAL_TWIN_TELEMETRY_URL: "http://vista-digital-twin@evil.example:8767", DIGITAL_TWIN_SCOPE_SECRET: "x".repeat(40) }, /loopback/],
    ["a short Twin scope secret", { DIGITAL_TWIN_TELEMETRY_URL: "http://127.0.0.1:8767", DIGITAL_TWIN_SCOPE_SECRET: "short" }, /at least 32/],
    ["a local placeholder secret", { SUPABASE_ANON_KEY: "local-int-anon-key-not-a-secret" }, /placeholder/],
    ["a malformed prerequisite enforcement cutoff", { COURSE_PREREQUISITES_ENFORCED_FROM: "2026-12-01" }, /COURSE_PREREQUISITES_ENFORCED_FROM/],
    ["a cutoff without a time zone", { COURSE_PREREQUISITES_ENFORCED_FROM: "2026-12-01T00:00:00" }, /COURSE_PREREQUISITES_ENFORCED_FROM/],
  ])("rejects %s", (_name, override, pattern) => expect(() => validateProductionConfig({ ...valid, ...override })).toThrow(pattern));
  it("requires a strong signing secret when device provisioning is enabled, and rejects a malformed flag or a placeholder", () => {
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "true" })).toThrow(/DEVICE_TOKEN_SECRET/);
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "true", DEVICE_TOKEN_SECRET: "short" })).toThrow(/at least 32/);
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "yes" })).toThrow(/DEVICE_PROVISIONING_ENABLED/);
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "true", DEVICE_TOKEN_SECRET: "local-int-device-secret-not-a-secret-0000" })).toThrow(/placeholder/);
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "true", DEVICE_TOKEN_SECRET: "d".repeat(48) })).not.toThrow();
    expect(() => validateProductionConfig({ ...valid, DEVICE_PROVISIONING_ENABLED: "false" })).not.toThrow();
  });
  it("accepts the Twin container on the private Docker network, exactly as the production secret sets it", () => expect(() => validateProductionConfig({ ...valid, DIGITAL_TWIN_TELEMETRY_URL: "http://vista-digital-twin:8767", DIGITAL_TWIN_SCOPE_SECRET: "x".repeat(64) })).not.toThrow());
  it("accepts temporary passwords on, and a loopback Twin with a strong secret", () => expect(() => validateProductionConfig({ ...valid, STUDENT_TEMP_PASSWORD_ENABLED: "true", DIGITAL_TWIN_TELEMETRY_URL: "http://127.0.0.1:8767", DIGITAL_TWIN_SCOPE_SECRET: "a".repeat(48) })).not.toThrow());
});
