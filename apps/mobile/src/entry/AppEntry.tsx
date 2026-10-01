import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { OnboardingScreen } from "../onboarding/OnboardingScreen";
import { hasCompletedOnboarding } from "../services/onboardingStorage";
import { appFontSources } from "../theme";
import { useAppTheme } from "../ThemeContext";
import { AuthEntryPlaceholder } from "./AuthEntryPlaceholder";
import { BootScreen } from "./BootScreen";
import { resolveEntryPhase } from "./entryPhase";
import { MainShell } from "./MainShell";

// Hold the native splash from the first moment JS runs (it must be called at
// module scope — from a hook it can be too late) until the entry gate is
// ready, then let it fade straight into the first real screen. No-op on web.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

type Props = {
  reduceMotion: boolean;
  // E-STOP lives in App.tsx, above this gate; it is only passed through to
  // the main app.
  emergencyStopped: boolean;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
};

// The app's entry flow: decides which ONE product phase is mounted —
// booting, onboarding, auth or the main app (see entryPhase.ts) — and owns
// what that decision needs: fonts, the onboarding check and the splash.
export function AppEntry({ emergencyStopped, onEmergencyStop, onResetEmergencyStop, reduceMotion }: Props) {
  const { mode: themeMode, ready: themeReady } = useAppTheme();
  const { status: authStatus } = useAuth();
  const [fontsLoaded, fontError] = useFonts(appFontSources);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  // Screens get fontsReady exactly as before (false → system fallback). The
  // gate only needs fonts to have SETTLED: a font failure falls back to
  // system fonts instead of holding the splash forever.
  const fontsReady = fontsLoaded && !fontError;
  const fontsSettled = fontsLoaded || Boolean(fontError);
  const booted = fontsSettled && themeReady && onboardingCompleted !== null && authStatus !== "checking";
  const phase = resolveEntryPhase({ authStatus, booted, onboardingCompleted: onboardingCompleted === true });

  useEffect(() => {
    let mounted = true;

    hasCompletedOnboarding().then((completed) => {
      if (mounted) setOnboardingCompleted(completed);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (booted) SplashScreen.hide();
  }, [booted]);

  return (
    <>
      {/* One status bar for every phase, always matching the theme — every
          phase paints the theme background behind it. */}
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />

      {phase === "booting" && <BootScreen />}

      {phase === "onboarding" && (
        <OnboardingScreen
          fontsReady={fontsReady}
          // OnboardingScreen persists completion itself; this only moves the
          // gate on — to the auth entry, or straight into the app when a
          // "continue without an account" choice is already stored.
          onComplete={() => setOnboardingCompleted(true)}
          reduceMotion={reduceMotion}
        />
      )}

      {phase === "auth" && <AuthEntryPlaceholder fontsReady={fontsReady} />}

      {phase === "app" && (
        <MainShell
          emergencyStopped={emergencyStopped}
          fontsReady={fontsReady}
          onEmergencyStop={onEmergencyStop}
          onResetEmergencyStop={onResetEmergencyStop}
          reduceMotion={reduceMotion}
        />
      )}
    </>
  );
}
