import { Check } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import { Gender } from "../types";

export const GENDER_OPTIONS: readonly { value: Gender; label: string }[] = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
  { value: "undisclosed", label: "Không muốn trả lời" }
];

export function genderLabel(value: Gender): string {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

// Large single-choice rows, not a dropdown. Selected = accent border +
// check + bold label together, never color alone; announced as a radio
// group.
export function GenderOptions({
  fontsReady,
  onChange,
  value
}: {
  value: Gender | null;
  onChange: (value: Gender) => void;
  fontsReady: boolean;
}) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {GENDER_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            aria-checked={selected}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
          >
            <SkyText fontsReady={fontsReady} variant={selected ? "sectionTitle" : "body"}>
              {option.label}
            </SkyText>
            {selected ? <Check color={colors.accentInk} size={20} strokeWidth={2.5} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    group: {
      gap: space.sm
    },
    row: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: corner.card,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 56,
      paddingHorizontal: layout.cardPadding
    },
    rowSelected: {
      borderColor: colors.accentInk,
      borderWidth: 2,
      // Keeps the label from shifting when the border thickens.
      paddingHorizontal: layout.cardPadding - 1
    },
    pressed: {
      opacity: 0.78
    }
  });
}
