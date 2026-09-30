// SkyNex Skill model — "a learned capability the robot can perform for the
// user". This is the future-facing shape; screens still read the legacy
// `Task` shape via the adapter in data/tasks.ts until they migrate.
//
// Only a small subset belongs on cards (media, name, availability when it
// isn't "ready"). Everything descriptive — summary, requirements, steps,
// outcome — is Skill Detail material.
//
// Deliberately absent: progress, success rate, run history, live readiness.
// Those are runtime data; they get fields only when a real backend provides
// them, never as mocks (the same rule data/tasks.ts has always followed).

// "learning" = the robot is still learning this skill (never "training",
// which is our internal pipeline word, not the user's).
export type SkillAvailability = "ready" | "learning" | "coming_soon";

// Grouping for future browsing (chips appear once there are ~8+ skills).
export type SkillCategory = "tidying" | "pick_place" | "kitchen" | "organizing";

// What the robot perceives and does to perform the skill — shown to people
// in plain words, never as a spec list.
export type SkillCapability = "vision" | "grasp" | "place" | "sort" | "sequence";

export type SkillLevel = "basic" | "intermediate" | "advanced";

// A piece of media, wherever it lives. Bundled assets are resolved through
// the registry in data/skillMedia.ts (React Native needs static require()),
// remote ones by URL — so a future API can hand either without the model
// changing.
export type MediaRef = { kind: "bundled"; assetId: string } | { kind: "remote"; url: string };

export type SkillMedia = {
  // Still image: cards and the Skill Detail hero.
  cover?: MediaRef;
  // Short muted loop for Skill Detail only (never autoplays in lists).
  preview?: MediaRef;
};

// Placeholder icon keys, used only until a skill has real `media.cover`.
// Kept as data (a string key, not a component) so the shape survives a JSON
// API response unchanged. Mapped to components in data/skillIcons.ts.
export type SkillIconKey = "utensils" | "grip" | "chef-hat" | "boxes";

export interface Skill {
  id: string;
  name: string;
  // One sentence describing the result, not the method.
  summary: string;
  availability: SkillAvailability;
  category: SkillCategory;
  capabilities: SkillCapability[];
  // "Robot cần…" — what must be true in the room, in plain words.
  requirements?: string[];
  // How the robot performs it, in order.
  steps?: string[];
  expectedOutcome?: string;
  // Typical duration, structured so copy ("~1 phút") is formatted at the
  // edge rather than stored.
  durationSeconds?: number;
  level?: SkillLevel;
  // Real photo/video when it exists; `icon` is the fallback until then.
  media?: SkillMedia;
  icon?: SkillIconKey;
}
