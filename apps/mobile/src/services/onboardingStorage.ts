import AsyncStorage from "@react-native-async-storage/async-storage";

// Bumping this forces onboarding to show again for everyone on next launch
// (e.g. a future redesign) without needing a migration step.
// Version 2 is the SO-Arm101 intro; older native devices may already have
// persisted version 1 from an earlier onboarding pass.
export const ONBOARDING_VERSION = 2;

const STORAGE_KEY = "omniarm.onboardingVersion";

// Dev-only override: flip to true to force the intro to show on every
// launch while testing it, without clearing AsyncStorage or reinstalling
// the app. Guarded by `__DEV__` below so a forgotten `true` can never ship
// in a release build.
export const DEV_FORCE_ONBOARDING = true;


export function hasSeenCurrentOnboarding(raw: string | null): boolean {
  const version = raw ? Number(raw) : 0;
  return Number.isFinite(version) && version >= ONBOARDING_VERSION;
}

export async function hasCompletedOnboarding(): Promise<boolean> {
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
