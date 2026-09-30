// SkyNex motion duration tokens (ms). Definitions only — nothing animates
// from this file yet.
//
// Range follows the ui-ux-pro-max guidance for UI transitions (150–300ms;
// slower reads as sluggish). `normal` matches the 240ms already used in
// DebugScreen. Ambient/looping motion (ArmModelViewer's 760ms pulse,
// Connect's 900ms scan spinner) is intentionally outside this scale — those
// are continuous indicators, not transitions.
//
// Consumers must still honor the app's `reduceMotion` flag (threaded from
// App.tsx) by skipping or shortening the animation.
export const motion = {
  // Press feedback, toggles, small state changes.
  fast: 150,
  // Element enter/exit, toasts, content swaps.
  normal: 240,
  // Larger surfaces: sheets, full-card transitions.
  slow: 300
} as const;

export type MotionToken = keyof typeof motion;
