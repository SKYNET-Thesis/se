import { ThemeMode } from "./theme";

// Dev/QA-only theme override.
//
// This is only the seed shown before ThemeContext's AsyncStorage read
// resolves, and the fallback when nothing is stored yet (see
// services/themeStorage.ts) — real theme switching now lives in
// Settings > Giao diện, not here. Flip this to "light" locally if a
// screenshot script needs the app to boot straight into Light without
// going through Settings first. Revert to "dark" before shipping — this
// is the app's default appearance whenever no persisted choice exists.
//
// The Home avatar no longer touches theme at all; it navigates to
// Settings > Tài khoản (see HomeScreen.tsx / App.tsx).
export const DEV_INITIAL_THEME_MODE: ThemeMode = "dark";

// Dev/QA-only entry-flow overrides. Independent of each other, so each part
// of the entry flow can be exercised on its own. Both are read only behind
// `__DEV__` (see services/onboardingStorage.ts and services/authStorage.ts),
// so a forgotten `true` can never change a release build.
//
// Show onboarding on every launch, whatever was stored.
export const DEV_FORCE_ONBOARDING = true;
// Start every launch signed out (ignore a stored "continue without an
// account" choice), so the auth entry is reachable without clearing storage.
export const DEV_FORCE_AUTH_ENTRY = false;
