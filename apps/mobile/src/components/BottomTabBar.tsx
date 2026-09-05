import { Box, Camera, Hand, Bot } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
export type TabKey = "dashboard" | "debug" | "manual" | "camera";
const tabs = [{ key: "dashboard", label: "Robots", icon: Bot }, { key: "debug", label: "3D Debug", icon: Box }, { key: "manual", label: "Manual", icon: Hand }, { key: "camera", label: "Camera", icon: Camera }] as const;
export function BottomTabBar({ activeTab, onChange }: {
    activeTab: TabKey;
    onChange: (tab: TabKey) => void;
}) {
    return <View style={s.wrap}><View style={s.bar}>{tabs.map(({ key, label, icon: Icon }) => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: key === activeTab }} onPress={() => onChange(key)} style={[s.tab, key === activeTab && s.active]}><Icon size={21} color="#202b55"/>{key === activeTab && <Text style={s.label}>{label}</Text>}</Pressable>)}</View></View>;
}
const s = StyleSheet.create({ wrap: { paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8, width: "100%", maxWidth: 760, alignSelf: "center" }, bar: { flexDirection: "row", backgroundColor: "rgba(226,230,255,0.65)", borderRadius: 30, padding: 7, alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }, tab: { minHeight: 44, minWidth: 48, paddingHorizontal: 13, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 24 }, active: { backgroundColor: "#67d9ff", flexGrow: 1, marginHorizontal: 3 }, label: { fontSize: 12, fontWeight: "700", color: "#202b55" } });
