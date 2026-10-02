import type { SignUpPayload } from "../auth/types";

// Boundary to the future SkyNex account backend. There is no auth backend
// yet, so the only honest answer this can give is "not available": it never
// signs anyone in, never creates an account, never checks a password and
// never returns a token.
//
// When the backend exists, only this file's implementation changes. Expected
// future outcomes (each added here only once the backend defines it):
//   { ok: true, ... }                        — a real session
//   { ok: false, reason: "invalidCredentials" }   (sign-in)
//   { ok: false, reason: "emailInUse" }           (sign-up)
//   { ok: false, reason: "network" }
type AuthUnavailable = { ok: false; reason: "unavailable" };

export type SignInResult = AuthUnavailable;
export type SignUpResult = AuthUnavailable;

const UNAVAILABLE: AuthUnavailable = { ok: false, reason: "unavailable" };

export async function signInWithEmail(_email: string, _password: string): Promise<SignInResult> {
  return UNAVAILABLE;
}

// Takes only what a backend needs — the password confirmation is a
// client-side typing check and never reaches this boundary. The phone in
// the payload is unverified: there is no OTP step yet.
export async function signUp(_payload: SignUpPayload): Promise<SignUpResult> {
  return UNAVAILABLE;
}
