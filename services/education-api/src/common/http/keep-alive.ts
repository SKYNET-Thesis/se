/** The subset of Node's `http.Server` this setting touches. */
export interface KeepAliveServer { keepAliveTimeout: number; headersTimeout: number }

/**
 * Optional `HTTP_KEEP_ALIVE_TIMEOUT_MS`: how long the API keeps an idle HTTP connection open. Unset (or invalid) leaves Node's default
 * (5 s) untouched, so Production behaviour does not change. Clients that talk to the API directly and reuse connections (the real-stack
 * test runner does) otherwise hit `ECONNRESET` whenever a request lands at the moment the server closes an idle socket; a deployment
 * that puts a keep-alive proxy in front should set this above the proxy's own idle timeout for the same reason.
 * Returns the applied value, or null when nothing was changed.
 */
export function applyKeepAliveTimeout(server: KeepAliveServer, raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1000 || value > 600_000) return null;
  server.keepAliveTimeout = value;
  server.headersTimeout = value + 1000;      // Node requires headersTimeout > keepAliveTimeout
  return value;
}
