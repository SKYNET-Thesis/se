/**
 * The only places the Education API will send signed Digital Twin telemetry and revocations: the loopback (a Twin sharing the API's host
 * network in development) or the fixed container name `vista-digital-twin` on the private Docker network the deploy script creates.
 * No other host, userinfo, path or port syntax is accepted, so the setting can never point the API at an arbitrary server.
 */
export const isTwinInternalEndpoint = (endpoint: string | undefined | null): endpoint is string =>
  typeof endpoint === "string" && /^https?:\/\/(127\.0\.0\.1|localhost|vista-digital-twin)(:\d+)?$/i.test(endpoint);
