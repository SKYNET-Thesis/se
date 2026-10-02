// Boundary to the future SkyNex account backend. There is no auth backend
// yet, so the only honest answer this can give is "not available": it never
// signs anyone in, never checks a password and never returns a token.
//
// When the backend exists, only this file's implementation changes. Expected
// future outcomes (each added here only once the backend defines it):
//   { ok: true, ... }                        — a real session
//   { ok: false, reason: "invalidCredentials" }
//   { ok: false, reason: "network" }
export type SignInResult = { ok: false; reason: "unavailable" };

export async function signInWithEmail(_email: string, _password: string): Promise<SignInResult> {
  return { ok: false, reason: "unavailable" };
}
