import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "omniarm.taskFavorites";

export async function getFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // Storage unavailable: fail open to "no favorites" rather than crash.
    return [];
  }
}

export async function toggleFavorite(id: string): Promise<string[]> {
  const current = await getFavorites();
  const next = current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id];

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort persistence: if this fails, the toggle simply doesn't
    // survive an app restart, same fail-open pattern as onboardingStorage.ts.
  }

  return next;
}
