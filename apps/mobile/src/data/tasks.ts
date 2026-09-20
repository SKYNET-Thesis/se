export type TaskStatus = "ready" | "training" | "coming_soon";

export type Task = {
  id: string;
  name: string;
  description: string;
  // Key into the icon lookup in src/components/TaskCard.tsx — a string
  // (not a component reference) so this shape survives a JSON API response
  // unchanged.
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

// Mock catalogue standing in for a future backend/VLA task registry. Every
// field already matches the shape a real API response would need — the
// only change required when that endpoint exists is inside getTasks()'s
// body below; no screen should need to change.
//
// `imageUrl` uses remote placeholder images for this UI-first phase. The
// task video field is intentionally unset until the demo media/VLA pipeline
// exists; detail screens already reserve that frame and render a placeholder.
//
// `isFavorite` here is a seed value only, illustrating that the field
// varies per task. At runtime the actual favorite state always comes from
// favoritesStorage.ts (starting empty on a fresh install), never from this
// mock — see favoritesStorage.ts for why.
//
// `level`/`estimatedDuration`/`robot`/`mode` are static product metadata —
// authored once per task, same for every user/session. They are not a
// substitute for live readiness (robot connected, calibration, camera,
// model) once that exists; that data has no field here because it isn't
// implemented yet, and should never be mocked as if it were real telemetry.
const MOCK_TASKS: readonly Task[] = [
  {
    id: "task-clear-table",
    name: "Dọn bàn",
    description: "Gom đồ vật trên bàn và xếp gọn vào đúng vị trí quy định.",
    icon: "utensils",
    imageUrl: "https://placehold.co/640x360/17171B/F3F2EE/png?text=Don+ban",
    status: "ready",
    isFavorite: false,
    level: "Cơ bản",
    estimatedDuration: "~1 phút",
    robot: "SO-ARM101",
    mode: "Tự động",
    requirements: ["Vật thể nằm trong vùng thao tác của robot", "Có khu vực đặt đích rõ ràng"],
    steps: [
      "Nhận diện các vật thể cần dọn",
      "Tiếp cận và gắp vật thể",
      "Di chuyển tới khu vực đặt đích",
      "Đặt vật thể vào vị trí quy định"
    ],
    expectedOutcome: "Các vật thể được chuyển khỏi vùng làm việc và đặt gọn vào khu vực quy định."
  },
  {
    id: "task-pick-place",
    name: "Gắp đồ",
    description: "Gắp vật thể từ điểm A và đặt sang điểm B theo toạ độ yêu cầu.",
    icon: "grip",
    imageUrl: "https://placehold.co/640x360/17171B/F3F2EE/png?text=Gap+do",
    status: "ready",
    isFavorite: false,
    level: "Cơ bản",
    estimatedDuration: "~30 giây",
    robot: "SO-ARM101",
    mode: "Tự động",
    requirements: ["Vật thể nằm trong tầm với của robot", "Kích thước vật thể phù hợp với gripper"],
    steps: [
      "Xác định vị trí vật thể",
      "Đưa gripper tới vị trí gắp",
      "Kẹp và nâng vật thể",
      "Di chuyển vật thể tới vị trí đích"
    ],
    expectedOutcome: "Vật thể được gắp và chuyển tới vị trí đích theo yêu cầu."
  },
  {
    id: "task-cook",
    name: "Nấu ăn",
    description: "Thực hiện các bước nấu ăn cơ bản theo trình tự đã huấn luyện.",
    icon: "chef-hat",
    imageUrl: "https://placehold.co/640x360/17171B/F3F2EE/png?text=Nau+an",
    status: "training",
    isFavorite: false,
    level: "Nâng cao",
    estimatedDuration: "~3 phút",
    robot: "SO-ARM101",
    mode: "Tự động",
    requirements: ["Nguyên liệu nằm trong vùng thao tác", "Dụng cụ cần thiết đã được bố trí sẵn"],
    steps: [
      "Nhận diện nguyên liệu và dụng cụ",
      "Thực hiện các thao tác theo trình tự",
      "Di chuyển hoặc xử lý nguyên liệu",
      "Hoàn tất bước nấu theo tác vụ"
    ],
    expectedOutcome: "Các bước thao tác được thực hiện theo trình tự đã định nghĩa cho tác vụ."
  },
  {
    id: "task-organize",
    name: "Xếp đồ",
    description: "Sắp xếp vật dụng vào kệ hoặc hộp theo danh mục.",
    icon: "boxes",
    imageUrl: "https://placehold.co/640x360/17171B/F3F2EE/png?text=Xep+do",
    status: "coming_soon",
    isFavorite: false,
    level: "Trung bình",
    estimatedDuration: "~2 phút",
    robot: "SO-ARM101",
    mode: "Tự động",
    requirements: ["Vật thể có thể được gắp ổn định", "Khu vực xếp nằm trong workspace"],
    steps: [
      "Xác định vật thể và vùng đích",
      "Gắp từng vật thể",
      "Di chuyển tới vị trí xếp",
      "Đặt vật thể theo thứ tự"
    ],
    expectedOutcome: "Các vật thể được sắp xếp gọn vào khu vực đích theo thứ tự xác định."
  }
];

// async on purpose — mimics the shape of a future network call so call
// sites (screens) already await it and won't need to change when this
// becomes a real fetch().
export async function getTasks(): Promise<Task[]> {
  return MOCK_TASKS.map((task) => ({ ...task }));
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const tasks = await getTasks();
  return tasks.find((task) => task.id === id);
}
