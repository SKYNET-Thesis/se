// Client-side auth contract. There is no auth backend yet, so this models
// only what the app can honestly know today.
//
//   checking  — the stored choice hasn't been read yet (boot is waiting)
//   signedOut — no account and no "continue without an account" choice:
//               the user lands on the auth entry
//   guest     — the user chose "Tiếp tục không cần tài khoản"; the robot
//               works over the local network, no account needed
//   signedIn  — RESERVED for a real account session. Nothing sets it until
//               a backend and an authService exist; it is never faked.
export type AuthStatus = "checking" | "signedOut" | "guest" | "signedIn";

// What is persisted (services/authStorage.ts). Only the guest choice exists
// today; a real session's tokens will live in secure storage, never here.
export type StoredAuthMode = "guest";

// ── Create Account ──────────────────────────────────────────────────────

export type Gender = "male" | "female" | "other" | "undisclosed";

// What a future sign-up request carries. Built only at the final step from
// the in-memory draft; never persisted. The password confirmation is not
// part of it (client-side typing check only).
export type SignUpPayload = {
  email: string;
  password: string;
  profile: {
    // Shown for personalization; one field, not first/last name.
    displayName: string;
    // E.164, e.g. "+84912345678". Unverified: there is no OTP yet.
    phone: string;
    // ISO calendar date, "YYYY-MM-DD".
    birthDate: string;
    gender: Gender;
  };
};
