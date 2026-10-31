export type LessonPathStatus = "completed" | "current" | "available" | "locked" | "in_progress";

export interface CoursePathLockReason {
  code: "PREREQUISITE_NOT_COMPLETED" | "PREREQUISITE_MINIMUM_SCORE_NOT_MET";
  prerequisiteLessonId: string;
  prerequisiteLessonTitle: string;
  message: string;
}

export interface CoursePathLesson {
  id: string;
  ordinal: number;
  title: string;
  status: LessonPathStatus;
  progressPercent: number;
  prerequisite: Array<{ lessonId: string; title: string; required: boolean; minimumScore: number | null }>;
  lockReason: CoursePathLockReason | null;
  completedAt: Date | null;
}

export interface CoursePathResponse {
  course: { id: string; title: string; status: string };
  progressPercent: number;
  currentLessonId: string | null;
  lessons: CoursePathLesson[];
}

export interface ProgressionProjection {
  completedLessonId: string | null;
  newlyUnlockedLessonIds: string[];
}
