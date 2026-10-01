import { Circle, Clock } from "lucide-react-native";
import { StatusBadge, StatusBadgeProps } from "../ui/StatusBadge";
import type { RobotStatus } from "../ui/StatusBadge";
import { SkillAvailability } from "../../types/skill";

// A skill's availability, drawn with the StatusBadge shell so every status
// in the app shares one visual grammar (neutral pill, colored glyph, label
// always shown). It describes the SKILL, never the robot: robot readiness
// stays in StatusBadge/RobotReadinessCard, and the two are never merged.
//
// "ready" is the default state and renders NOTHING — a clean tile is the
// signal that a skill works. Only exceptions (learning, coming soon) earn a
// label. The rule lives here, not in each caller, so no screen can bring
// back a wall of "Sẵn sàng" badges.
type ShownAvailability = Exclude<SkillAvailability, "ready">;

// Glyphs match TaskStatusChip (clock / circle); only the color tone is
// borrowed from StatusBadge's scale.
const SKILL_STATUS: Record<ShownAvailability, { tone: RobotStatus; label: string; icon: typeof Clock }> = {
  learning: { tone: "warning", label: "Đang học", icon: Clock },
  coming_soon: { tone: "offline", label: "Sắp có", icon: Circle }
};

// For accessibility labels ("Nấu ăn, Đang học"); undefined when ready.
export function skillAvailabilityLabel(availability: SkillAvailability): string | undefined {
  return availability === "ready" ? undefined : SKILL_STATUS[availability].label;
}

type Props = Omit<StatusBadgeProps, "status" | "label" | "icon"> & {
  availability: SkillAvailability;
};

export function SkillStatus({ availability, ...rest }: Props) {
  if (availability === "ready") return null;
  const { icon, label, tone } = SKILL_STATUS[availability];
  return <StatusBadge {...rest} icon={icon} label={label} status={tone} />;
}
