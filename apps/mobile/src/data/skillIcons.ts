import { Boxes, ChefHat, Grip, LayoutGrid, Utensils } from "lucide-react-native";
import { ComponentType } from "react";
import { SkillIconKey } from "../types/skill";

export type SkillIconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

// TEMPORARY placeholders. A skill's icon is only what its visual slot shows
// until real `media.cover` exists — see resolveSkillVisual() in
// data/skillMedia.ts, which prefers media and falls back to this. Nothing
// should treat an icon as the skill's identity.
//
// Same glyphs as components/TaskCard.tsx getTaskIcon(), which still serves
// the not-yet-migrated screens; when those move to this module, that copy
// goes away.
const SKILL_ICONS: Record<SkillIconKey, SkillIconComponent> = {
  utensils: Utensils,
  grip: Grip,
  "chef-hat": ChefHat,
  boxes: Boxes
};

// Unknown or missing keys (e.g. a new skill from a future API) fall back to
// a neutral glyph instead of rendering nothing.
export function getSkillIcon(icon?: string): SkillIconComponent {
  return (icon && SKILL_ICONS[icon as SkillIconKey]) || LayoutGrid;
}
