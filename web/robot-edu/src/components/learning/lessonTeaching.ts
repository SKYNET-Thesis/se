import type { LessonConceptSection, LessonContent } from '../../lib/api';
import type { LessonActivity } from './lessonActivities';

/**
 * What a Course 1 (legacy content) Reading activity teaches. The lesson stores one list of concept sections and one list
 * of safety notes; the activity list splits a lesson into one or two readings. Each reading gets its own section(s) so two
 * readings never repeat each other and no section is dropped:
 *   reading i (not last) → section i;  last reading → every remaining section, plus the safety notes.
 * The first reading also opens with the lesson summary and what the student will learn.
 */
export interface ReadingPlan {
  lead: string | null;
  objectives: string[];
  sections: LessonConceptSection[];
  safety: string[];
}

export function readingPlan(content: Partial<LessonContent> | null | undefined, activities: LessonActivity[], activityId: string): ReadingPlan {
  const readings = activities.filter((activity) => activity.type === 'reading');
  const position = Math.max(0, readings.findIndex((activity) => activity.id === activityId));
  const first = position === 0;
  const last = position === readings.length - 1 || readings.length === 0;
  const all = (content?.conceptSections ?? []).filter((section) => section?.title || section?.content);
  const sections = last ? all.slice(position) : all.slice(position, position + 1);
  return {
    lead: first ? content?.summary?.trim() || null : null,
    objectives: first ? (content?.learningObjectives ?? []).filter(Boolean) : [],
    sections,
    safety: last ? (content?.safetyNotes ?? []).filter(Boolean) : [],
  };
}

/** Authored text sometimes writes arrows as "->"; shown as a proper arrow. Nothing else is changed. */
export const displayText = (text: string) => text.replace(/\s->\s/g, ' → ');
