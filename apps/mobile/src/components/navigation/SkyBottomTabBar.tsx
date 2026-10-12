import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useEffect, useMemo, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useAppTheme } from "../../ThemeContext";
import { ThemeColors, ThemeMode } from "../../theme";

type Props = BottomTabBarProps & {
  // The ONE measurement source for the floating E-STOP's drag region: the
  // height this bar occupies above the safe area (0 while hidden).
  onHeightChange: (height: number) => void;
};

// Width from which the dock also shows tab names (tablet / desktop web).
// Below it — every phone, including real devices — the dock is icon-only;
// each tab still announces its name to screen readers.
const LABELS_MIN_WIDTH = 600;
const DOCK_HEIGHT = 62;
const DOCK_RADIUS = 26;
// On wide layouts the dock stays a compact control, centred, not a strip.
const DOCK_MAX_WIDTH = 560;

// iOS reports the keyboard before it animates in; Android after.
const KEYBOARD_SHOW = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const KEYBOARD_HIDE = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

function useKeyboardVisible(enabled: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return undefined;
    }
    const show = Keyboard.addListener(KEYBOARD_SHOW, () => setVisible(true));
    const hide = Keyboard.addListener(KEYBOARD_HIDE, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return visible;
}

// SkyNex floating dock. A presentation layer over React Navigation's own tab
// state: it renders `state.routes`, takes each tab's icon, label, colours
// and accessibility from its descriptor options, and drives navigation only
// through the standard tabPress / tabLongPress events — so nested stacks,
// pop-to-top on re-press and every tab listener behave exactly as with the
// stock bar. Nothing here holds navigation state of its own.
//
// Geometry: a rounded, slightly raised dock inset from the screen edges.
// The safe area (home indicator / gesture bar) is already applied below the
// navigator by MainShell's SafeAreaView, so this only adds the dock's own
// breathing room above it.
export function SkyBottomTabBar({ descriptors, navigation, onHeightChange, state }: Props) {
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const { width } = useWindowDimensions();

  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const keyboardVisible = useKeyboardVisible(focusedOptions.tabBarHideOnKeyboard === true);
  const hidden = keyboardVisible;

  // Hidden under the keyboard: nothing is rendered, so the E-STOP region
  // must be told the bar occupies nothing.
  useEffect(() => {
    if (hidden) onHeightChange(0);
  }, [hidden, onHeightChange]);

  if (hidden) return null;

  const showLabels = width >= LABELS_MIN_WIDTH && focusedOptions.tabBarShowLabel !== false;

  return (
    <View onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)} style={styles.wrapper}>
      <View accessibilityRole="tablist" style={styles.dock}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === "string" ? options.tabBarLabel : (options.title ?? route.name);
          const tint = focused
            ? (options.tabBarActiveTintColor ?? colors.accentStrong)
            : (options.tabBarInactiveTintColor ?? colors.textSecondary);

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });

          return (
            <Pressable
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              // RN web drops `selected` from accessibilityState.
              aria-selected={focused}
              key={route.key}
              onLongPress={onLongPress}
              onPress={onPress}
              style={({ pressed }) => [styles.item, showLabels && styles.itemWithLabel, pressed && styles.pressed]}
              testID={options.tabBarButtonTestID}
            >
              {options.tabBarIcon?.({ focused, color: tint, size: 24 })}
              {showLabels && (
                <Text numberOfLines={1} style={[styles.label, options.tabBarLabelStyle, { color: tint }]}>
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  const light = mode === "light";
  return StyleSheet.create({
    // Transparent margin band around the dock; it shows the page background
    // (the navigator's background), so the dock reads as detached.
    wrapper: {
      backgroundColor: colors.background,
      paddingBottom: 8,
      // 14pt each side: enough background around the dock to read as
      // floating, while five icon slots stay roomy at 360pt.
      paddingHorizontal: 14,
      paddingTop: 6
    },
    dock: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: DOCK_RADIUS,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      height: DOCK_HEIGHT,
      maxWidth: DOCK_MAX_WIDTH,
      paddingHorizontal: 6,
      width: "100%",
      // Light: a small soft shadow. Dark: separation comes from the surface
      // and border alone — no glow, no heavy elevation.
      ...(light
        ? {
            elevation: 3,
            shadowColor: "#000",
            shadowOffset: { height: 4, width: 0 },
            shadowOpacity: 0.08,
            shadowRadius: 12
          }
        : { elevation: 0, shadowOpacity: 0 })
    },
    // Five equal, flexible slots — optically even from Home to Profile.
    item: {
      alignItems: "center",
      flex: 1,
      height: DOCK_HEIGHT,
      justifyContent: "center"
    },
    itemWithLabel: {
      flexDirection: "row",
      gap: 6
    },
    label: {
      fontSize: 12
    },
    // Restrained: opacity only — no bounce, no scale, no colour flash.
    pressed: {
      opacity: 0.7
    }
  });
}
