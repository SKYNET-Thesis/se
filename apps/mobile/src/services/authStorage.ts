import AsyncStorage from "@react-native-async-storage/async-storage";
import { StoredAuthMode } from "../auth/types";
import { DEV_FORCE_AUTH_ENTRY } from "../devConfig";

// Remembers ONE non-secret fact: that this user chose to continue without
// an account. No credentials, passwords or tokens are ever stored here —
// real session tokens, once a backend exists, belong in secure storage.
const STORAGE_KEY = "skynex.auth.mode";

function isStoredAuthMode(value: unknown): value is StoredAuthMode {
  return value === "guest";
}

// Fails open to "no stored choice" (→ the auth entry), the same pattern as
// the app's other AsyncStorage services: a storage problem never crashes
// boot and never grants anything.
export async function getStoredAuthMode(): Promise<StoredAuthMode | null> {
  // Dev-only override, see devConfig.ts.
  if (__DEV__ && DEV_FORCE_AUTH_ENTRY) return null;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isStoredAuthMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function setStoredAuthMode(mode: StoredAuthMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Best-effort: if this fails, the user simply sees the auth entry again
    // next launch.
  }
}

// Signing out, and the dev helper for manual QA (call from the JS console:
// `require("./src/services/authStorage").clearStoredAuthMode()`).
export async function clearStoredAuthMode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
