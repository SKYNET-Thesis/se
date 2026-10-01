import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEV_FORCE_ONBOARDING } from "../devConfig";

// Bumping this forces onboarding to show again for everyone on next launch
// (e.g. a future redesign) without needing a migration step.
// Version 2 is the SO-Arm101 intro; older native devices may already have
// persisted version 1 from an earlier onboarding pass.
export const ONBOARDING_VERSION = 2;

// Legacy "omniarm." prefix kept on purpose: renaming the key would show
// onboarding again to everyone who has already completed it.
const STORAGE_KEY = "omniarm.onboardingVersion";


export function hasSeenCurrentOnboarding(raw: string | null): boolean {
  const version = raw ? Number(raw) : 0;
  return Number.isFinite(version) && version >= ONBOARDING_VERSION;
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  // Dev-only override, see devConfig.ts.
  if (__DEV__ && DEV_FORCE_ONBOARDING) return false;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return hasSeenCurrentOnboarding(raw);
  } catch {
    // Storage unavailable: fail open to "not completed" rather than crash boot.
    return false;
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(ONBOARDING_VERSION));
  } catch {
    // Best-effort: if this fails, onboarding simply reappears next launch.
  }
}

// Dev-only helper for manual QA. Call from a debug menu or the JS console
// (e.g. `require("./src/services/onboardingStorage").resetOnboarding()`) —
// intentionally not wired to any production UI control.
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
