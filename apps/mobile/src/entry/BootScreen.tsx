import { StyleSheet, Text, View } from "react-native";
import { font, type } from "../theme";
import { useAppTheme } from "../ThemeContext";

// What shows while the entry gate waits. On native it sits under the held
// splash screen and is normally never seen; on web (no native splash) it is
// the first visible frame.
//
// Until the saved theme has been read, it renders nothing themed at all: a
// wrong-mode frame here is exactly the flash the gate exists to prevent.
export function BootScreen() {
  const { colors, ready } = useAppTheme();

  if (!ready) return null;

  // Fonts may still be loading, so the system fallback is used on purpose.
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }, font("display", false)]}>SkyNex</Text>
      <Text style={[styles.text, { color: colors.textSecondary }, font("body", false)]}>Đang nạp giao diện</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center"
  },
  title: {
    ...type.title
  },
  text: {
    ...type.body
  }
});
