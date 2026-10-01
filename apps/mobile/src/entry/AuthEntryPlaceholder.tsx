import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { font, radius, spacing, type } from "../theme";
import { useAppTheme } from "../ThemeContext";

// TEMPORARY (Auth Phase 2A). Proves the "auth" phase routes correctly; the
// real Welcome screen replaces this file in Auth Phase 2B. Deliberately
// unstyled beyond legibility — do not polish it.
export function AuthEntryPlaceholder({ fontsReady }: { fontsReady: boolean }) {
  const { colors } = useAppTheme();
  const { continueAsGuest } = useAuth();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }, font("display", fontsReady)]}>SkyNex</Text>
        <Pressable
          accessibilityRole="button"
          onPress={continueAsGuest}
          style={({ pressed }) => [styles.button, { borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: colors.textPrimary }, font("display", fontsReady)]}>
            Tiếp tục không cần tài khoản
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  body: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xl,
    justifyContent: "center",
    padding: spacing.xl
  },
  title: {
    ...type.title
  },
  button: {
    alignItems: "center",
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg
  },
  buttonText: {
    ...type.label
  },
  pressed: {
    opacity: 0.78
  }
});
