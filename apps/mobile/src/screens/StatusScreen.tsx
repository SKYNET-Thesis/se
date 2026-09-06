import { ScrollView, StyleSheet } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { colors, spacing } from "../theme";
import { HomeStatusSummary } from "./HomeScreen";

type Props = {
  emergencyStopped: boolean;
  fontsReady: boolean;
  onBack: () => void;
};

export function StatusScreen({ emergencyStopped, fontsReady, onBack }: Props) {
  return (
    <ScrollView
      accessibilityLabel="Màn hình trạng thái tổng OmniArm"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <ScreenHeader
        fontsReady={fontsReady}
        meta="MOCK"
        onBack={onBack}
        subtitle="Tổng quan kết nối, calibrate, chế độ và hồ sơ hiện hành"
        title="Trạng thái"
      />
      <HomeStatusSummary emergencyStopped={emergencyStopped} fontsReady={fontsReady} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1
  },
  content: {
    gap: spacing.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl
  }
});
