import type { RootTabParamList } from "./AppNavigator";

// SkyNex product navigation contract. Separates what a tab *means* to the
// user (Skills, Robot, Vision, Profile) from the technical route names the
// navigator is built on (Tasks, Control, Camera, Settings). Route names stay
// untouched — deep links, nested-stack params and every navigate() call keep
// working — while product-facing copy reads from here.
//
// Type-only import above: AppNavigator imports this module at runtime, so a
// value import back would be circular.
export const SkyNexTabs = {
  HOME: "Home",
  SKILLS: "Tasks",
  ROBOT: "Control",
  VISION: "Camera",
  PROFILE: "Settings"
} as const satisfies Record<string, keyof RootTabParamList>;

export type SkyNexTabKey = keyof typeof SkyNexTabs;
export type SkyNexRouteName = (typeof SkyNexTabs)[SkyNexTabKey];

export const SkyNexTabLabels = {
  HOME: "Home",
  SKILLS: "Skills",
  ROBOT: "Robot",
  VISION: "Vision",
  PROFILE: "Profile"
} as const satisfies Record<SkyNexTabKey, string>;

// Compile-time guard: adding a bottom tab to RootTabParamList without giving
// it a product meaning here fails typecheck instead of silently drifting.
type UnmappedRoute = Exclude<keyof RootTabParamList, SkyNexRouteName>;
const everyTabIsMapped: [UnmappedRoute] extends [never] ? true : UnmappedRoute = true;
void everyTabIsMapped;
