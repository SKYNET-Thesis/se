import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

type Props = {
  style?: StyleProp<ViewStyle>;
  opacity?: number;
};

// OmniArm's identity motif: two long, unequal strokes emanating from a single
// point low on the frame — a distant echo of a dual-arm reach, kept quiet
// enough to read as texture on the frame, never as the subject of it.
export function MotionTrajectory({ style, opacity = 1 }: Props) {
  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <Svg height="100%" viewBox="0 0 300 400" width="100%">
        <Path
          d="M40,430 C40,300 140,230 220,150"
          fill="none"
          opacity={0.16 * opacity}
          stroke={colors.accent}
          strokeLinecap="round"
          strokeWidth={1.25}
        />
        <Path
          d="M110,430 C110,320 150,270 190,230"
          fill="none"
          opacity={0.08 * opacity}
          stroke={colors.accent}
          strokeLinecap="round"
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }
});
