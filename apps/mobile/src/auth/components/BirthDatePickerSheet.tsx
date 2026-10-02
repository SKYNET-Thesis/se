import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyButton, SkyText } from "../../components/ui";
import { corner } from "../../design-system/radius";
import { layout, space } from "../../design-system/spacing";
import { SkyNexColors, useSkyNexTokens } from "../../design-system/tokens";
import {
  BIRTH_YEAR_SPAN,
  clampToValidPast,
  DateParts,
  daysInMonth,
  parseIsoDate,
  todayParts,
  toIsoDate
} from "../signup/birthDate";

type Props = {
  visible: boolean;
  // ISO "YYYY-MM-DD" or null when nothing has been chosen yet.
  value: string | null;
  onConfirm: (isoDate: string) => void;
  onCancel: () => void;
  fontsReady: boolean;
};

// Where the columns start when nothing is chosen yet. Only a scroll
// position — nothing is saved until "Xong".
const START_YEARS_AGO = 25;
const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

// Birth-date picker: a bottom sheet with Day / Month / Year columns. Built
// from the app's own primitives (no native date-picker dependency, so it
// behaves the same on iOS, Android and web) and restricted to real calendar
// days up to today — impossible or future dates can't be chosen at all.
export function BirthDatePickerSheet({ fontsReady, onCancel, onConfirm, value, visible }: Props) {
  const { colors } = useSkyNexTokens();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const today = todayParts();
  const initial = (): DateParts =>
    parseIsoDate(value ?? "") ?? clampToValidPast({ day: 1, month: 1, year: today.year - START_YEARS_AGO });
  const [draft, setDraft] = useState<DateParts>(initial);

  // Each opening starts from the saved value (or the neutral start).
  useEffect(() => {
    if (visible) setDraft(initial());
  }, [visible, value]);

  const select = (patch: Partial<DateParts>) => setDraft((current) => clampToValidPast({ ...current, ...patch }));

  const years = Array.from({ length: BIRTH_YEAR_SPAN + 1 }, (_, i) => today.year - i);
  const months = Array.from({ length: draft.year === today.year ? today.month : 12 }, (_, i) => i + 1);
  const lastDay =
    draft.year === today.year && draft.month === today.month ? today.day : daysInMonth(draft.year, draft.month);
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        {/* Tapping outside cancels, like the system sheets. */}
        <Pressable accessibilityLabel="Đóng" accessibilityRole="button" onPress={onCancel} style={styles.scrim} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <SkyText accessibilityRole="header" fontsReady={fontsReady} variant="sectionTitle">
            Ngày sinh
          </SkyText>

          <View style={styles.columns}>
            <Column
              fontsReady={fontsReady}
              items={days}
              label="Ngày"
              onSelect={(day) => select({ day })}
              selected={draft.day}
              styles={styles}
              toLabel={(day) => String(day)}
            />
            <Column
              fontsReady={fontsReady}
              items={months}
              label="Tháng"
              onSelect={(month) => select({ month })}
              selected={draft.month}
              styles={styles}
              toLabel={(month) => `Tháng ${month}`}
            />
            <Column
              fontsReady={fontsReady}
              items={years}
              label="Năm"
              onSelect={(year) => select({ year })}
              selected={draft.year}
              styles={styles}
              toLabel={(year) => String(year)}
            />
          </View>

          <View style={styles.actions}>
            <SkyButton fontsReady={fontsReady} onPress={onCancel} style={styles.action} variant="secondary">
              Hủy
            </SkyButton>
            <SkyButton fontsReady={fontsReady} onPress={() => onConfirm(toIsoDate(draft))} style={styles.action}>
              Xong
            </SkyButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// One scrollable column of choices. The selected row is marked by a filled
// row + bold text (never color alone) and announced as selected.
function Column({
  fontsReady,
  items,
  label,
  onSelect,
  selected,
  styles,
  toLabel
}: {
  items: number[];
  selected: number;
  onSelect: (value: number) => void;
  toLabel: (value: number) => string;
  label: string;
  fontsReady: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const index = Math.max(0, items.indexOf(selected));

  // Bring the selection into the middle of the column when it opens.
  const centerSelection = () =>
    scrollRef.current?.scrollTo({
      animated: false,
      y: Math.max(0, (index - Math.floor(VISIBLE_ROWS / 2)) * ROW_HEIGHT)
    });

  return (
    <View accessibilityLabel={label} style={styles.column}>
      <SkyText fontsReady={fontsReady} style={styles.columnLabel} tone="secondary" variant="caption">
        {label}
      </SkyText>
      <ScrollView
        nestedScrollEnabled
        onLayout={centerSelection}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        style={styles.columnList}
      >
        {items.map((item) => {
          const isSelected = item === selected;
          return (
            <Pressable
              accessibilityLabel={`${label} ${toLabel(item)}`}
              accessibilityRole="button"
              aria-selected={isSelected}
              key={item}
              onPress={() => onSelect(item)}
              style={[styles.row, isSelected && styles.rowSelected]}
            >
              <SkyText
                fontsReady={fontsReady}
                tone={isSelected ? "primary" : "secondary"}
                variant={isSelected ? "sectionTitle" : "body"}
              >
                {toLabel(item)}
              </SkyText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: SkyNexColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end"
    },
    // The app's existing modal treatment (see MainShell's Reset modal): the
    // page background, mostly opaque — no new color.
    scrim: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      backgroundColor: colors.background,
      opacity: 0.7
    },
    sheet: {
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      gap: space.md,
      maxWidth: 520,
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.lg,
      width: "100%"
    },
    columns: {
      flexDirection: "row",
      gap: space.xs
    },
    column: {
      flex: 1,
      gap: space.xxs
    },
    columnLabel: {
      textAlign: "center"
    },
    columnList: {
      height: ROW_HEIGHT * VISIBLE_ROWS
    },
    row: {
      alignItems: "center",
      borderRadius: corner.button,
      height: ROW_HEIGHT,
      justifyContent: "center"
    },
    rowSelected: {
      backgroundColor: colors.surfaceRaised
    },
    actions: {
      flexDirection: "row",
      gap: space.sm
    },
    action: {
      flex: 1
    }
  });
}
