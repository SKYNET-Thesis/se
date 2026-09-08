import { requireNativeModule, requireNativeView } from "expo";
import { ComponentType } from "react";
import { StyleProp, ViewStyle } from "react-native";

export type PhoneARPose = {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  trackingState: "tracking" | "limited" | "lost";
};

type NativePhoneARViewProps = {
  onPose?: (event: { nativeEvent: PhoneARPose }) => void;
  style?: StyleProp<ViewStyle>;
};

let NativePhoneARView: ComponentType<NativePhoneARViewProps> | null = null;
try {
  // requireNativeViewManager can return a lazy placeholder in Expo Go. Probe the
  // actual module first so Expo Go uses CameraView/DeviceMotion instead of
  // rendering an "Unimplemented component" native view.
  requireNativeModule("ExpoPhoneAR");
  NativePhoneARView = requireNativeView("ExpoPhoneAR", "PhoneARView") as ComponentType<NativePhoneARViewProps>;
} catch {
  // Expo Go and Android do not contain the local iOS module. The screen uses DeviceMotion there.
}

export const isPhoneARNativeAvailable = NativePhoneARView !== null;

export function PhoneARView(props: NativePhoneARViewProps) {
  if (!NativePhoneARView) return null;
  return <NativePhoneARView {...props} />;
}
