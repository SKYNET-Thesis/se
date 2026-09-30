import { Skill, SkillAvailability } from "../types/skill";
import { formatSkillDuration, formatSkillLevel, getSkillById, getSkills } from "./skills";

// LEGACY ADAPTER — the `Task` shape existing screens (Tasks, TaskDetail,
// Home's skill strip, TaskStatusChip, data/robot.ts) still read. The data
// itself now lives once, in data/skills.ts; this file only derives the old
// shape from it, so those screens keep working untouched while they migrate
// to `Skill` one by one. Delete this file once nothing imports it.

export type TaskStatus = "ready" | "training" | "coming_soon";

export type Task = {
  id: string;
  name: string;
  description: string;
  // Key into the icon lookup in src/components/TaskCard.tsx — a string
  // (not a component reference) so this shape survives a JSON API response
  // unchanged. (New code: data/skillIcons.ts.)
  icon?: string;
  imageUrl?: string;
  videoUrl?: string;
  status: TaskStatus;
  isFavorite: boolean;

  // Static product metadata for the quick-facts row on TaskDetail — set once
  // per task, not derived from any runtime/robot state. Deliberately
  // distinct from future LIVE readiness (robot connected?, calibration ok?,
  // camera ready?, model ready?) which has no field here yet because it
  // isn't implemented: this group is safe to mock today, that group is not.
  level?: string;
  estimatedDuration?: string;
  robot?: string;
  mode?: string;

  // Static product metadata for the "Yêu cầu / Quy trình / Kết quả mong đợi"
  // sections on TaskDetail — authored once per task, same shape as the
  // quick-facts fields above. This is a description of the task itself
  // (what it needs, what it does, what "done" looks like), never live
  // execution/runtime state — there is no per-step progress or success
  // rate here, and none should be added until real execution exists.
  requirements?: string[];
  steps?: string[];
  expectedOutcome?: string;
};

// "learning" is the product word; the legacy status keeps its old key so
// TaskStatusChip and TaskDetail's switch statements don't change.
const STATUS_FROM_AVAILABILITY: Record<SkillAvailability, TaskStatus> = {
  ready: "ready",
  learning: "training",
  coming_soon: "coming_soon"
};

// Only a REMOTE cover can travel as a legacy `imageUrl`; bundled media is
// reachable through data/skillMedia.ts once screens read `Skill` directly.
function coverUrl(skill: Skill): string | undefined {
  const cover = skill.media?.cover;
  return cover?.kind === "remote" ? cover.url : undefined;
}

function previewUrl(skill: Skill): string | undefined {
  const preview = skill.media?.preview;
  return preview?.kind === "remote" ? preview.url : undefined;
}

function toTask(skill: Skill): Task {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.summary,
    icon: skill.icon,
    imageUrl: coverUrl(skill),
    videoUrl: previewUrl(skill),
    status: STATUS_FROM_AVAILABILITY[skill.availability],
    // Favorites always come from favoritesStorage at runtime; this field was
    // only ever a seed and nothing reads it.
    isFavorite: false,
    level: formatSkillLevel(skill.level),
    estimatedDuration: formatSkillDuration(skill.durationSeconds),
    // Same for every skill today, so the Skill model drops them; kept here
    // only because TaskDetail's quick-facts row still shows them.
    robot: "SO-ARM101",
    mode: "Tự động",
    requirements: skill.requirements,
    steps: skill.steps,
    expectedOutcome: skill.expectedOutcome
  };
}

// async on purpose — mimics the shape of a future network call so call
// sites (screens) already await it and won't need to change when this
// becomes a real fetch().
export async function getTasks(): Promise<Task[]> {
  const skills = await getSkills();
  return skills.map(toTask);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const skill = await getSkillById(id);
  return skill ? toTask(skill) : undefined;
}
