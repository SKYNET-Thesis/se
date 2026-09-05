import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
export function GradientBackground() {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" preserveAspectRatio="none"><Defs><LinearGradient id="appBackground" x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor="#171d51"/><Stop offset="0.35" stopColor="#393f9a"/><Stop offset="1" stopColor="#8180bc"/></LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#appBackground)"/></Svg></View>;
}
