import { Box, Camera, Hand, LayoutDashboard, LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type TabKey = "dashboard" | "debug" | "manual" | "camera";

type Tab = {
  key: TabKey;
  label: string;
  icon: LucideIcon;
};

const tabs: Tab[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "debug", label: "3D Debug", icon: Box },
  { key: "manual", label: "Manual", icon: Hand },
  { key: "camera", label: "Camera", icon: Camera }
];

type Props = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomTabBar({ activeTab, onChange }: Props) {
  return (
    <View style={styles.bar}>
      {tabs.map(({ key, label, icon: Icon }) => {
        const active = key === activeTab;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon size={20} color={active ? "#7ee4b8" : "#7f8984"} strokeWidth={active ? 2.5 : 2} />
            </View>
            <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 72,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#181a19",
    borderTopWidth: 1,
    borderTopColor: "#303531",
    paddingHorizontal: 8,
    paddingTop: 6
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  iconWrap: {
    width: 42,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  iconWrapActive: {
    backgroundColor: "#183027"
  },
  label: {
    color: "#7f8984",
    fontSize: 10,
    fontWeight: "700"
  },
  labelActive: {
    color: "#bdf5d8"
  },
  pressed: {
    opacity: 0.7
  }
});
