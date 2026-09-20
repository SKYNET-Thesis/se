import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeMode } from "../theme";

// Separate key namespace from onboardingStorage.ts / favoritesStorage.ts —
// this is its own storage domain and must never collide with either.
const STORAGE_KEY = "skynex.themeMode";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

// Fails open to "dark" on any read problem (storage unavailable, corrupted
// value, a mode string from a future version) rather than crashing boot or
// guessing — dark is the app's one already-approved, always-safe appearance.
export async function getStoredThemeMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isThemeMode(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Best-effort persistence: if this fails, the selection simply doesn't
    // survive an app restart, same fail-open pattern as the app's other
    // AsyncStorage-backed services.
  }
}
