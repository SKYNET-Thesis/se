import { AuthStatus } from "../auth/types";

// The four product phases of the app. Exactly one is mounted at a time.
export type EntryPhase = "booting" | "onboarding" | "auth" | "app";

type EntryFacts = {
  // Fonts settled, onboarding state read, auth state read, saved theme read.
  booted: boolean;
  onboardingCompleted: boolean;
  authStatus: AuthStatus;
};

// The ONE rule for which phase the app is in. Onboarding (brand story) and
// auth (account access) are separate gates, checked in order: a returning
// user who was signed out goes straight to the auth entry, never back
// through onboarding.
export function resolveEntryPhase({ authStatus, booted, onboardingCompleted }: EntryFacts): EntryPhase {
  if (!booted || authStatus === "checking") return "booting";
  if (!onboardingCompleted) return "onboarding";
  if (authStatus === "signedOut") return "auth";
  return "app";
}
