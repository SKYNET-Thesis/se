import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBar, TabKey } from "./src/components/BottomTabBar";
import { CameraScreen } from "./src/screens/CameraScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { DebugScreen } from "./src/screens/DebugScreen";
import { ManualScreen } from "./src/screens/ManualScreen";

import { GradientBackground } from "./src/components/GradientBackground";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safe}>
        <GradientBackground />
        <StatusBar style="light" />
        <View style={styles.content}>
          {activeTab === "dashboard" && <DashboardScreen onOpenDebug={() => setActiveTab("debug")} onOpenCamera={() => setActiveTab("camera")} />}
          {activeTab === "debug" && <DebugScreen />}
          {activeTab === "manual" && <ManualScreen />}
          {activeTab === "camera" && <CameraScreen onBack={() => setActiveTab("dashboard")} onOpenManual={() => setActiveTab("manual")} />}
        </View>
        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#20265f"
  },
  content: {
    flex: 1
  }
});
