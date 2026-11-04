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
  const supabase = new URL(required(config, "SUPABASE_URL"));
  if (supabase.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");
  required(config, "SUPABASE_SERVICE_ROLE_KEY");
  for (const origin of required(config, "WEB_ORIGIN").split(",")) {
    const url = new URL(origin.trim());
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("WEB_ORIGIN must contain HTTPS origins only.");
  }
  for (const name of ["ROBOT_PROGRAM_MAX_STEPS", "ROBOT_PROGRAM_MAX_BYTES", "HTTP_BODY_LIMIT_BYTES", "PORT"]) {
    if (config[name] !== undefined && (!Number.isSafeInteger(Number(config[name])) || Number(config[name]) < 1)) throw new Error(`${name} must be a positive integer.`);
  }
  return config;
}
