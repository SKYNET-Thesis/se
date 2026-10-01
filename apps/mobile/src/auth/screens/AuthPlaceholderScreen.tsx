import { StyleSheet, View } from "react-native";
import { SkyText } from "../../components/ui";
import { layout } from "../../design-system/spacing";
import { useSkyNexTokens } from "../../design-system/tokens";

// TEMPORARY (Auth Phase 2B). Stands in for the Login and Create Account
// screens so Welcome's navigation and back behavior can be proven. Replaced
// by the real screens in the next auth phases — do not polish it. There is
// no auth backend: it offers no form and signs nobody in.
export function AuthPlaceholderScreen({ fontsReady }: { fontsReady: boolean }) {
  const { colors } = useSkyNexTokens();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyText fontsReady={fontsReady} tone="secondary">
        Sắp có
      </SkyText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: layout.screenGutter
  }
});
