export type LessonPathStatus = "completed" | "current" | "available" | "locked" | "in_progress";

export interface CoursePathLockReason {
  code: "PREREQUISITE_NOT_COMPLETED" | "PREREQUISITE_MINIMUM_SCORE_NOT_MET" | "COURSE_PREREQUISITE_NOT_COMPLETED";
  prerequisiteLessonId: string;
  prerequisiteLessonTitle: string;
  /** Set only for COURSE_PREREQUISITE_NOT_COMPLETED: the course(s) that must be completed first. */
  unmetCourses?: Array<{ id: string; title: string }>;
  message: string;
}

export interface CoursePathLesson {
  id: string;
  code: string | null;
  ordinal: number;
  title: string;
  status: LessonPathStatus;
  progressPercent: number;
  prerequisite: Array<{ lessonId: string; title: string; required: boolean; minimumScore: number | null }>;
  lockReason: CoursePathLockReason | null;
  completedAt: Date | null;
  summary: string | null;
  learningItems: string[];
  estimatedMinutes: number | null;
}

export interface CourseOverviewCompetency { code: string; title: string; }

export interface CoursePathResponse {
  course: {
    id: string;
    title: string;
    status: string;
    description: string | null;
    label: string | null;
    level: string | null;
    recommendedGrades: string | null;
    learningOutcome: string | null;
    competencies: CourseOverviewCompetency[];
    /** Course-level prerequisites the learner has not completed; non-empty means every unfinished lesson is locked. */
    unmetPrerequisites: Array<{ id: string; title: string }>;
  };
  progressPercent: number;
  currentLessonId: string | null;
  lessons: CoursePathLesson[];
}

export interface ProgressionProjection {
  completedLessonId: string | null;
  newlyUnlockedLessonIds: string[];
}
