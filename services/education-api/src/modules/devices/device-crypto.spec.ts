import { generateKeyPairSync, sign } from "node:crypto";
import { authMessage, enrollMessage, newSecret, parseEd25519PublicKey, sha256Hex, signDeviceToken, verifyDeviceToken, verifyEd25519 } from "./device-crypto";

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64url"), sign: (message: string) => sign(null, Buffer.from(message), privateKey).toString("base64url") };
};
const SECRET = "s".repeat(40);

describe("device crypto", () => {
  it("verifies a signature only for the same key, message and purpose", () => {
    const a = pair(); const b = pair(); const id = "11111111-1111-4111-8111-111111111111";
    const signature = a.sign(enrollMessage(id, "n1"));
    expect(verifyEd25519(a.publicKey, enrollMessage(id, "n1"), signature)).toBe(true);
    expect(verifyEd25519(b.publicKey, enrollMessage(id, "n1"), signature)).toBe(false);              // another key
    expect(verifyEd25519(a.publicKey, enrollMessage(id, "n2"), signature)).toBe(false);              // another nonce
    expect(verifyEd25519(a.publicKey, authMessage(id, "n1"), signature)).toBe(false);                // an enrollment signature cannot be replayed as a login
    expect(verifyEd25519(a.publicKey, enrollMessage("22222222-2222-4222-8222-222222222222", "n1"), signature)).toBe(false); // another device
  });

  it("accepts only Ed25519 SPKI keys", () => {
    expect(parseEd25519PublicKey(pair().publicKey)?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "der", type: "spki" }).toString("base64url");
    for (const bad of ["", "not a key", "AAAA", rsa, "A".repeat(60)]) expect(parseEd25519PublicKey(bad)).toBeNull();
    expect(verifyEd25519("garbage", "m", "sig")).toBe(false);
  });

  it("round-trips a device token and rejects tampering, expiry and the wrong secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { kind: "device" as const, sub: "d", org: "o", cv: 3, iat: now, exp: now + 60, jti: "j" };
    const token = signDeviceToken(SECRET, claims);
    expect(verifyDeviceToken(SECRET, token)).toMatchObject({ sub: "d", cv: 3 });
    expect(verifyDeviceToken("x".repeat(40), token)).toBeNull();
    const [v, p, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, cv: 99 })).toString("base64url");
    expect(verifyDeviceToken(SECRET, `${v}.${forged}.${sig}`)).toBeNull();
    expect(verifyDeviceToken(SECRET, `${v}.${p}.${sig}x`)).toBeNull();
    expect(verifyDeviceToken(SECRET, token, now + 61)).toBeNull();
    for (const bad of ["", "vd1", "vd1.a", "vd2.a.b", "a.b.c"]) expect(verifyDeviceToken(SECRET, bad)).toBeNull();
  });

  it("generates unpredictable secrets and stable hashes", () => {
    expect(new Set(Array.from({ length: 50 }, () => newSecret())).size).toBe(50);
    expect(newSecret(24).length).toBeGreaterThanOrEqual(32);
    expect(sha256Hex("a")).toBe(sha256Hex("a")); expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});
