import { ImageSourcePropType } from "react-native";
import { MediaRef, Skill } from "../types/skill";
import { getSkillIcon, SkillIconComponent } from "./skillIcons";

// Media abstraction for skills. Real photos/videos arrive later; this file
// is where they plug in, so no component has to change when they do.
//
// Future bundled assets (assets/skills/<skill-id>/cover.webp, preview.mp4)
// register here — React Native needs a static require() per file, so a
// skill's `media` refers to them by id instead of by path:
//
//   const BUNDLED_MEDIA: Record<string, number> = {
//     "clear-table/cover": require("../../assets/skills/task-clear-table/cover.webp"),
//   };
//
// Only real, approved assets register here — nothing is generated.
const BUNDLED_MEDIA: Record<string, number> = {
  "library/hero/desktop": require("../../assets/skills/skill-library-hero.jpg"),
  // Art-directed 1:1 crop of the same photo for portrait phones.
  "library/hero/mobile": require("../../assets/skills/skill-library-hero-mobile.png")
};

// Placement-level art for the Skills library hero. It belongs to the
// library, not to any one skill, so it is never a skill's `media.cover` and
// never appears on cards or Skill Detail. Two art-directed variants of ONE
// photo: a 3:2 frame for wide windows, a ~1:1 frame for portrait phones.
export const SKILLS_LIBRARY_HERO_MEDIA: Record<"desktop" | "mobile", MediaRef> = {
  desktop: { kind: "bundled", assetId: "library/hero/desktop" },
  mobile: { kind: "bundled", assetId: "library/hero/mobile" }
};

// Portrait frames use the mobile crop when it is registered; otherwise (and
// on wide frames) the desktop photo, cropped with `cover`.
export function resolveLibraryHeroMedia({ portrait }: { portrait: boolean }): MediaRef {
  const { desktop, mobile } = SKILLS_LIBRARY_HERO_MEDIA;
  return portrait && resolveMediaSource(mobile) ? mobile : desktop;
}

// Placeholder services and generic dummy-image hosts never count as media —
// the one shared version of the check FeaturedTaskCard and TaskCard's grid
// tile each carry a copy of today.
export function hasRealMedia(url?: string): boolean {
  return !!url && !/placehold|placeholder|dummyimage/i.test(url);
}

// Resolves a MediaRef to something <Image> can render, or undefined when it
// can't (unregistered bundled id, placeholder URL).
export function resolveMediaSource(ref?: MediaRef): ImageSourcePropType | undefined {
  if (!ref) return undefined;
  if (ref.kind === "bundled") return BUNDLED_MEDIA[ref.assetId];
  return hasRealMedia(ref.url) ? { uri: ref.url } : undefined;
}

// What a skill's visual slot should show: real cover media when it exists,
// otherwise the placeholder icon. Components render whichever kind comes
// back inside the SAME reserved frame, so swapping icon → photo later is a
// data change, never a layout change.
export type SkillVisual = { kind: "media"; source: ImageSourcePropType } | { kind: "icon"; Icon: SkillIconComponent };

export function resolveSkillVisual(skill: Pick<Skill, "media" | "icon">): SkillVisual {
  const source = resolveMediaSource(skill.media?.cover);
  return source ? { kind: "media", source } : { kind: "icon", Icon: getSkillIcon(skill.icon) };
}

// Preview video for Skill Detail only (lists never autoplay). Remote URLs
// only for now; bundled video registers above once it exists.
export function resolveSkillPreview(skill: Pick<Skill, "media">): MediaRef | undefined {
  const preview = skill.media?.preview;
  if (!preview) return undefined;
  if (preview.kind === "bundled") return BUNDLED_MEDIA[preview.assetId] ? preview : undefined;
  return hasRealMedia(preview.url) ? preview : undefined;
}
