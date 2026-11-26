import { isTwinInternalEndpoint } from "../modules/learning/digital-twin-endpoint";
import { parsePrerequisitePolicy } from "../modules/learning/course-prerequisites";

type Configuration = Record<string, unknown>;

function required(config: Configuration, name: string): string {
  const value = config[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required in production.`);
  return value.trim();
}

export function validateProductionConfig(config: Configuration): Configuration {
  if (config.NODE_ENV !== "production") return config;
  const database = new URL(required(config, "DATABASE_URL"));
  if (!database.protocol.startsWith("postgres") || !database.hostname || !database.username || !database.password || !["require", "verify-full"].includes(database.searchParams.get("sslmode") ?? "")) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL with credentials and sslmode=require or verify-full.");
  }
  const runtimeRole = required(config, "DATABASE_RUNTIME_ROLE");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole) || runtimeRole === "postgres" || database.username.split(".")[0] !== runtimeRole) {
    throw new Error("DATABASE_RUNTIME_ROLE must name the dedicated non-superuser role used by DATABASE_URL.");
  }
  const supabase = new URL(required(config, "SUPABASE_URL"));
  if (supabase.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");
  required(config, "SUPABASE_SERVICE_ROLE_KEY");
  for (const origin of required(config, "WEB_ORIGIN").split(",")) {
    const url = new URL(origin.trim());
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("WEB_ORIGIN must contain HTTPS origins only.");
  }
  // Student sign-in, password change and session revocation call Supabase with the public key; without it students cannot log in.
  const flag = String(config.STUDENT_TEMP_PASSWORD_ENABLED ?? "").trim().toLowerCase();
  if (flag && !["true", "false"].includes(flag)) throw new Error("STUDENT_TEMP_PASSWORD_ENABLED must be true or false.");
  // Student starts over AWS IoT stay refused unless the simulation-only mode is selected explicitly; it needs the Thing prefix to read the Device Shadow.
  const startMode = String(config.VISTA_IOT_START_MODE ?? "").trim();
  if (startMode && startMode !== "simulation") throw new Error("VISTA_IOT_START_MODE must be empty or simulation.");
  if (startMode === "simulation" && !String(config.VISTA_IOT_THING_PREFIX ?? "").trim()) throw new Error("VISTA_IOT_THING_PREFIX is required when VISTA_IOT_START_MODE=simulation.");
  required(config, "SUPABASE_ANON_KEY");
  // Learning Media lives in ONE bucket; the S3 endpoint override exists only for local loopback storage.
  required(config, "LEARNING_MEDIA_BUCKET");
  required(config, "AWS_REGION");
  const mediaEndpoint = typeof config.LEARNING_MEDIA_S3_ENDPOINT === "string" ? config.LEARNING_MEDIA_S3_ENDPOINT.trim() : "";
  if (mediaEndpoint) throw new Error("LEARNING_MEDIA_S3_ENDPOINT must not be set in production (it is for local loopback storage only).");
  // Behind the load balancer the client address comes from X-Forwarded-For; without trust the per-address limits would throttle everyone together.
  if (!/^\d+$/.test(String(config.TRUST_PROXY ?? "").trim()) || Number(config.TRUST_PROXY) < 1) throw new Error("TRUST_PROXY must be the number of trusted proxy hops (1 behind the ALB).");
  const twinUrl = typeof config.DIGITAL_TWIN_TELEMETRY_URL === "string" ? config.DIGITAL_TWIN_TELEMETRY_URL.trim() : "";
  if (twinUrl) {
    if (!isTwinInternalEndpoint(twinUrl)) throw new Error("DIGITAL_TWIN_TELEMETRY_URL must be a loopback address or the Twin container on the private Docker network (http://vista-digital-twin:<port>).");
    if (required(config, "DIGITAL_TWIN_SCOPE_SECRET").length < 32) throw new Error("DIGITAL_TWIN_SCOPE_SECRET must be at least 32 characters.");
  }
  // Device provisioning is opt-in; when enabled it needs its own signing secret (device API tokens are signed with it).
  const devices = String(config.DEVICE_PROVISIONING_ENABLED ?? "").trim().toLowerCase();
  if (devices && !["true", "false"].includes(devices)) throw new Error("DEVICE_PROVISIONING_ENABLED must be true or false.");
  if (devices === "true" && String(config.DEVICE_TOKEN_SECRET ?? "").trim().length < 32) throw new Error("DEVICE_TOKEN_SECRET must be at least 32 characters when device provisioning is enabled.");
  // Course prerequisite enforcement is opt-in (absent = disabled). A malformed value must fail the deployment, not silently change who is locked out.
  const prerequisitePolicy = parsePrerequisitePolicy(typeof config.COURSE_PREREQUISITES_ENFORCED_FROM === "string" ? config.COURSE_PREREQUISITES_ENFORCED_FROM : undefined);
  if (prerequisitePolicy.mode === "disabled" && prerequisitePolicy.invalid) throw new Error(prerequisitePolicy.invalid);
  // Local-development placeholders must never reach production.
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "DIGITAL_TWIN_SCOPE_SECRET", "VISTA_RUNTIME_TOKEN", "DEVICE_TOKEN_SECRET"]) {
    const value = String(config[name] ?? "");
    if (/not-a-secret|local-int|twsecret_local|test-only|changeme/i.test(value)) throw new Error(`${name} contains a local/test placeholder value.`);
  }
  for (const name of ["ROBOT_PROGRAM_MAX_STEPS", "ROBOT_PROGRAM_MAX_BYTES", "HTTP_BODY_LIMIT_BYTES", "PORT"]) {
    if (config[name] !== undefined && (!Number.isSafeInteger(Number(config[name])) || Number(config[name]) < 1)) throw new Error(`${name} must be a positive integer.`);
  }
  return config;
}
