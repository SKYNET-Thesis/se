import { ComponentType } from "react";
import { Layers, RotateCw, ScanEye, Zap } from "lucide-react-native";

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

export type OnboardingStat = {
  label: string;
  value: string;
  icon: IconComponent;
};

export type OnboardingSlide = {
  id: "reveal" | "capability" | "ready";
  // Title is split so the payoff word can render in the accent color while
  // the rest stays neutral — titleMain + titleAccent concatenate to the
  // full title, read together by screen readers.
  titleMain: string;
  titleAccent: string;
  subtitle: string;
  stats: readonly OnboardingStat[];
};

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: "reveal",
    titleMain: "SO-ARM",
    titleAccent: "101",
    subtitle: "Robot song tay thông minh.",
    stats: [
      { label: "CẤU HÌNH", value: "DUAL ARM", icon: Layers },
      { label: "BẬC TỰ DO", value: "6-DOF ×2", icon: RotateCw }
    ]
  },
  {
    id: "capability",
    titleMain: "Nhìn. Hiểu. ",
    titleAccent: "Hành động.",
    subtitle: "Một lệnh, hai tay phối hợp.",
    stats: [{ label: "CHẾ ĐỘ", value: "AI VISION", icon: ScanEye }]
  },
  {
    id: "ready",
    titleMain: "Sẵn sàng ",
    titleAccent: "vận hành",
    subtitle: "Kết nối và bắt đầu điều khiển.",
    stats: [{ label: "TRẠNG THÁI", value: "READY", icon: Zap }]
  }
] as const;

export const BRAND_MARK = "OMNIARM";
export const CTA_CONTINUE = "Tiếp tục";
export const CTA_SKIP = "Bỏ qua";
export const CTA_START = "Bắt đầu";
