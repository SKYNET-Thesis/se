import { Skill } from "../types/skill";

// Mock skill catalogue standing in for a future backend/VLA skill registry.
// This is the single source of truth for skill data; data/tasks.ts derives
// the legacy `Task` shape from it for screens that haven't migrated yet.
// When a real endpoint exists, only getSkills()'s body changes.
//
// IDs keep their original `task-*` values on purpose: favorites are stored
// by id (services/favoritesStorage.ts) and routes pass `taskId`, so renaming
// them would silently drop every user's saved favorites.
//
// No `media` yet — real photos/videos arrive later (see data/skillMedia.ts);
// until then each skill falls back to its placeholder `icon`. The old
// placehold.co URLs are gone: every screen already treated them as "no
// media", so dropping them changes nothing on screen.
const MOCK_SKILLS: readonly Skill[] = [
  {
    id: "task-clear-table",
    name: "Dọn bàn",
    summary: "Gom đồ vật trên bàn và xếp gọn vào đúng vị trí quy định.",
    availability: "ready",
    category: "tidying",
    capabilities: ["vision", "grasp", "place"],
    requirements: ["Vật thể nằm trong vùng thao tác của robot", "Có khu vực đặt đích rõ ràng"],
    steps: [
      "Nhận diện các vật thể cần dọn",
      "Tiếp cận và gắp vật thể",
      "Di chuyển tới khu vực đặt đích",
      "Đặt vật thể vào vị trí quy định"
    ],
    expectedOutcome: "Các vật thể được chuyển khỏi vùng làm việc và đặt gọn vào khu vực quy định.",
    durationSeconds: 60,
    level: "basic",
    icon: "utensils"
  },
  {
    id: "task-pick-place",
    name: "Gắp đồ",
    summary: "Gắp vật thể từ điểm A và đặt sang điểm B theo toạ độ yêu cầu.",
    availability: "ready",
    category: "pick_place",
    capabilities: ["vision", "grasp", "place"],
    requirements: ["Vật thể nằm trong tầm với của robot", "Kích thước vật thể phù hợp với gripper"],
    steps: [
      "Xác định vị trí vật thể",
      "Đưa gripper tới vị trí gắp",
      "Kẹp và nâng vật thể",
      "Di chuyển vật thể tới vị trí đích"
    ],
    expectedOutcome: "Vật thể được gắp và chuyển tới vị trí đích theo yêu cầu.",
    durationSeconds: 30,
    level: "basic",
    icon: "grip"
  },
  {
    id: "task-cook",
    name: "Nấu ăn",
    summary: "Thực hiện các bước nấu ăn cơ bản theo trình tự đã học.",
    availability: "learning",
    category: "kitchen",
    capabilities: ["vision", "grasp", "sequence"],
    requirements: ["Nguyên liệu nằm trong vùng thao tác", "Dụng cụ cần thiết đã được bố trí sẵn"],
    steps: [
      "Nhận diện nguyên liệu và dụng cụ",
      "Thực hiện các thao tác theo trình tự",
      "Di chuyển hoặc xử lý nguyên liệu",
      "Hoàn tất các bước nấu"
    ],
    expectedOutcome: "Các bước thao tác được thực hiện theo trình tự đã định nghĩa cho kỹ năng.",
    durationSeconds: 180,
    level: "advanced",
    icon: "chef-hat"
  },
  {
    id: "task-organize",
    name: "Xếp đồ",
    summary: "Sắp xếp vật dụng vào kệ hoặc hộp theo danh mục.",
    availability: "coming_soon",
    category: "organizing",
    capabilities: ["vision", "grasp", "sort"],
    requirements: ["Vật thể có thể được gắp ổn định", "Khu vực xếp nằm trong workspace"],
    steps: [
      "Xác định vật thể và vùng đích",
      "Gắp từng vật thể",
      "Di chuyển tới vị trí xếp",
      "Đặt vật thể theo thứ tự"
    ],
    expectedOutcome: "Các vật thể được sắp xếp gọn vào khu vực đích theo thứ tự xác định.",
    durationSeconds: 120,
    level: "intermediate",
    icon: "boxes"
  }
];

// async on purpose — mimics a future network call, so callers already await
// it and won't change when this becomes a real fetch(). Returns copies so no
// caller can mutate the catalogue.
export async function getSkills(): Promise<Skill[]> {
  return MOCK_SKILLS.map((skill) => ({ ...skill }));
}

export async function getSkillById(id: string): Promise<Skill | undefined> {
  const skills = await getSkills();
  return skills.find((skill) => skill.id === id);
}

// Human copy for structured fields, formatted at the edge rather than stored.
const LEVEL_LABEL: Record<NonNullable<Skill["level"]>, string> = {
  basic: "Cơ bản",
  intermediate: "Trung bình",
  advanced: "Nâng cao"
};

export function formatSkillLevel(level: Skill["level"]): string | undefined {
  return level ? LEVEL_LABEL[level] : undefined;
}

// "~30 giây" under a minute, "~N phút" from a minute up.
export function formatSkillDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined;
  return seconds < 60 ? `~${seconds} giây` : `~${Math.round(seconds / 60)} phút`;
}
