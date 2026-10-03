import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { DEV_INITIAL_THEME_MODE } from "./src/devConfig";
import { AppEntry } from "./src/entry/AppEntry";
import { ThemeProvider } from "./src/ThemeContext";

// App.tsx owns only what must outlive every entry phase: the providers,
// device-level preferences, and the E-STOP safety state. Which screen is
// shown (booting / onboarding / auth / main app) is AppEntry's job.
export default function App() {
  return (
    <ThemeProvider initialMode={DEV_INITIAL_THEME_MODE}>
      <AuthProvider>
        <SafeAreaProvider>
          <AppRoot />
        </SafeAreaProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppRoot() {
  const [reduceMotion, setReduceMotion] = useState(false);
  // E-STOP's single source of truth. Deliberately ABOVE the entry gate: the
  // main app (MainShell) can mount and unmount — e.g. on sign-out — without
  // ever resetting a stop. Resetting stays an explicit, confirmed action
  // (MainShell's Reset modal). The floating E-STOP and Phone Teleop's
  // fullscreen overlay button both call the same activation setter instead
  // of each owning their own "stopped" state.
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const activateEmergencyStop = () => setEmergencyStopped(true);
  const resetEmergencyStop = () => setEmergencyStopped(false);

  useEffect(() => {
    // A previous Phone Teleop session may have left the OS in landscape after a
    // reload/background restart. The phone screen takes landscape ownership
    // again only while it is mounted.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <AppEntry
      emergencyStopped={emergencyStopped}
      onEmergencyStop={activateEmergencyStop}
      onResetEmergencyStop={resetEmergencyStop}
      reduceMotion={reduceMotion}
    />
  );
}
