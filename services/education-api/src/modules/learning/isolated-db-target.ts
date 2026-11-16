const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LEGACY_TEST_PORTS = new Set(['55432', '55433']);

/** Validate the exact local target selected by the disposable test harness. */
export function matchesDisposableDatabaseTarget(databaseUrl: string | undefined, username = 'vista_test'): boolean {
  if (!databaseUrl) return false;
  let url: URL;
  try { url = new URL(databaseUrl); } catch { return false; }

  const databaseName = process.env.VISTA_TEST_DATABASE_NAME ?? 'vista_test_course_builder';
  const configuredPort = process.env.VISTA_TEST_DATABASE_PORT;
  const portMatches = configuredPort
    ? url.port === configuredPort && /^\d{1,5}$/.test(configuredPort) && Number(configuredPort) >= 1024 && Number(configuredPort) <= 65535
    : LEGACY_TEST_PORTS.has(url.port);
  const projectRef = process.env.VISTA_DATABASE_PROJECT_REF ?? '';

  return LOOPBACK_HOSTS.has(url.hostname) && portMatches &&
    /^vista_test_[a-z0-9_]{1,48}$/.test(databaseName) && url.pathname === `/${databaseName}` &&
    decodeURIComponent(url.username) === username &&
    /^[a-z0-9-]{3,64}$/.test(projectRef) && projectRef !== 'ovijutkvaaxohauvuxbj';
}

export function isIsolatedIntegrationDatabase(databaseUrl: string | undefined, username = 'vista_test'): boolean {
  return matchesDisposableDatabaseTarget(databaseUrl, username) && !process.env.SUPABASE_URL;
}
