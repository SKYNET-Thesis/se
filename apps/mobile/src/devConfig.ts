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
// Settings > Tài khoản (see GlobalChrome.tsx / App.tsx).
export const DEV_INITIAL_THEME_MODE: ThemeMode = "dark";
