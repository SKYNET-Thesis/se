import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getStoredThemeMode, setStoredThemeMode } from "./services/themeStorage";
import { ThemeColors, ThemeMode, themePalettes } from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
  // Seed shown before the persisted value (if any) finishes loading, and
  // the permanent fallback when nothing is stored yet. See src/devConfig.ts
  // for the one place this should be flipped for a QA override — production
  // behavior is unaffected as long as that file's default stays "dark".
  initialMode?: ThemeMode;
};

export function ThemeProvider({ children, initialMode = "dark" }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  // Persisted read resolves after first paint; guards against that resolve
  // clobbering a mode the user has already picked in the meantime.
  const userHasChosenRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    getStoredThemeMode().then((stored) => {
      if (mounted && !userHasChosenRef.current) setModeState(stored);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    userHasChosenRef.current = true;
    setModeState(next);
    void setStoredThemeMode(next);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: themePalettes[mode],
      setMode
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Only migrated screens/components call this. Anything still importing the
// legacy `colors` export from theme.ts directly keeps working unchanged —
// this hook is purely additive.
export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme() must be called within a <ThemeProvider>");
  }
  return ctx;
}
