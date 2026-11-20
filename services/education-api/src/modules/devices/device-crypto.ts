import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export const newSecret = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** What a device signs. The prefix binds a signature to one purpose and one device, so it can never be replayed for another. */
export const enrollMessage = (deviceId: string, nonce: string) => `vista-device-enroll:v1:${deviceId}:${nonce}`;
export const authMessage = (deviceId: string, nonce: string) => `vista-device-auth:v1:${deviceId}:${nonce}`;

/** Accepts only an Ed25519 public key in SPKI DER form, base64url encoded. Returns null for anything else. */
export function parseEd25519PublicKey(publicKey: string): { key: ReturnType<typeof createPublicKey>; fingerprint: string } | null {
  try {
    if (!/^[A-Za-z0-9_-]{40,200}$/.test(publicKey)) return null;
    const der = Buffer.from(publicKey, "base64url");
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") return null;
    return { key, fingerprint: sha256Hex(der.toString("base64url")) };
  } catch { return null; }
}

export function verifyEd25519(publicKey: string, message: string, signature: string): boolean {
  const parsed = parseEd25519PublicKey(publicKey);
  if (!parsed || !/^[A-Za-z0-9_-]{80,100}$/.test(signature)) return false;
  try { return verify(null, Buffer.from(message, "utf8"), parsed.key, Buffer.from(signature, "base64url")); } catch { return false; }
}

export interface DeviceTokenClaims { kind: "device"; sub: string; org: string; cv: number; iat: number; exp: number; jti: string }

/** Short-lived server-signed device access token: `vd1.<payload>.<hmac>`. Not a cloud credential; valid only for this API. */
export function signDeviceToken(secret: string, claims: DeviceTokenClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `vd1.${payload}.${createHmac("sha256", secret).update(`vd1.${payload}`).digest("base64url")}`;
}

export function verifyDeviceToken(secret: string, token: string, now = Math.floor(Date.now() / 1000)): DeviceTokenClaims | null {
  const [version, payload, signature] = token.split(".");
  if (version !== "vd1" || !payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(`vd1.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DeviceTokenClaims;
    if (claims.kind !== "device" || typeof claims.sub !== "string" || typeof claims.org !== "string" || !Number.isInteger(claims.cv) || claims.exp <= now) return null;
    return claims;
  } catch { return null; }
}
