import AsyncStorage from "@react-native-async-storage/async-storage";

// Where the floating E-STOP sits — UI position ONLY. The emergency state
// itself is owned by App.tsx and is never stored here.
//
// Stored responsively (edge + vertical fraction of the safe drag range), not
// as pixels, so it survives other screen sizes, orientation and devices.
const STORAGE_KEY = "skynex.estop.position.v1";

export type EStopSide = "left" | "right";
export type EStopPosition = { side: EStopSide; yRatio: number };

// First launch: right edge, low in the thumb zone just above the tab bar
// (the drag range already ends above it) — below where screens put their
// primary actions (Skill Detail's and Home's "Bắt đầu").
export const DEFAULT_ESTOP_POSITION: EStopPosition = { side: "right", yRatio: 0.92 };

function isPosition(value: unknown): value is EStopPosition {
  if (!value || typeof value !== "object") return false;
  const { side, yRatio } = value as Record<string, unknown>;
  return (side === "left" || side === "right") && typeof yRatio === "number" && yRatio >= 0 && yRatio <= 1;
}

// Fails open to the default on any read problem, like the app's other
// AsyncStorage-backed services.
export async function getStoredEStopPosition(): Promise<EStopPosition> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPosition(parsed) ? parsed : DEFAULT_ESTOP_POSITION;
  } catch {
    return DEFAULT_ESTOP_POSITION;
  }
}

export async function setStoredEStopPosition(position: EStopPosition): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Best effort: the position simply isn't remembered.
  }
}
