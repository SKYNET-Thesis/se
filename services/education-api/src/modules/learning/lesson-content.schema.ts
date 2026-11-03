export interface LessonConceptSection {
  title: string;
  content: string;
}

export interface LessonContentV1 {
  version: 1;
  summary: string;
  learningObjectives: string[];
  conceptSections: LessonConceptSection[];
  robotConcept: string;
  taskPreview: string;
  estimatedMinutes?: number;
  safetyNotes: string[];
  completionCriteria: string;
  objective?: string;
  lessonType?: string;
  media?: unknown[];
}

export function normalizeLessonContent(raw: unknown, lessonTitle = "", ordinal = 1): LessonContentV1 {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : typeof obj.objective === "string" && obj.objective.trim()
        ? obj.objective.trim()
        : `Learn core robotics fundamentals for ${lessonTitle || `Lesson ${ordinal}`}.`;

  const learningObjectives: string[] = Array.isArray(obj.learningObjectives)
    ? obj.learningObjectives.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : typeof obj.objective === "string" && obj.objective.trim()
      ? [obj.objective.trim()]
      : [`Master foundational concepts for ${lessonTitle || `Lesson ${ordinal}`}.`];

  const conceptSections: LessonConceptSection[] = Array.isArray(obj.conceptSections)
    ? obj.conceptSections
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          title: typeof item.title === "string" ? item.title : "Concept",
          content: typeof item.content === "string" ? item.content : "",
        }))
        .filter((section) => section.content.length > 0)
    : [];

  const robotConcept =
    typeof obj.robotConcept === "string" && obj.robotConcept.trim()
      ? obj.robotConcept.trim()
      : "Robots execute instructions sequentially in physical space. Safe verification precedes all motion.";

  const taskPreview =
    typeof obj.taskPreview === "string" && obj.taskPreview.trim()
      ? obj.taskPreview.trim()
      : "Complete the designated practice mission according to the required pass criteria.";

  const estimatedMinutes = typeof obj.estimatedMinutes === "number" && obj.estimatedMinutes > 0 ? obj.estimatedMinutes : 20;

  const safetyNotes: string[] = Array.isArray(obj.safetyNotes)
    ? obj.safetyNotes.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : ["Always verify that the robot workspace is clear before executing commands."];

  const completionCriteria =
    typeof obj.completionCriteria === "string" && obj.completionCriteria.trim()
      ? obj.completionCriteria.trim()
      : "Complete all required steps to pass this lesson.";

  return {
    version: 1,
    summary,
    learningObjectives,
    conceptSections,
    robotConcept,
    taskPreview,
    estimatedMinutes,
    safetyNotes,
    completionCriteria,
    objective: typeof obj.objective === "string" ? obj.objective : summary,
    lessonType: typeof obj.lessonType === "string" ? obj.lessonType : undefined,
    media: Array.isArray(obj.media) ? obj.media : [],
  };
}
