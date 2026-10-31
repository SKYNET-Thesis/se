import type { LessonDetailResponse } from '../../lib/api';

export type LessonActivityType = 'reading' | 'video' | 'demonstration' | 'guided_practice' | 'knowledge_check' | 'simulation' | 'challenge' | 'physical_lab' | 'result' | 'reflection';
export type LessonActivityStatus = 'neutral' | 'unavailable';

export interface LessonActivity {
  id: string;
  type: LessonActivityType;
  title: string;
  description: string;
  durationMinutes: number | null;
  status: LessonActivityStatus;
  actionable: boolean;
  authoritative: boolean;
  action: 'reading' | 'knowledge_check' | 'practice' | 'unavailable' | null;
}

const reading = (id: string, title: string, description: string, durationMinutes: number | null): LessonActivity => ({ id, type: 'reading', title, description, durationMinutes, status: 'neutral', actionable: true, authoritative: false, action: 'reading' });
const demonstration = (id: string, title: string, description: string): LessonActivity => ({ id, type: 'demonstration', title, description, durationMinutes: null, status: 'neutral', actionable: true, authoritative: false, action: 'reading' });

export function buildLessonActivities(lesson: LessonDetailResponse): LessonActivity[] {
  const sections = lesson.content?.conceptSections ?? [];
  const summary = lesson.content?.summary ?? lesson.content?.taskPreview ?? '';
  const minutes = lesson.content?.estimatedMinutes ?? null;
  const firstReading = reading(`${lesson.id}-reading-1`, sections[0]?.title ?? `Understanding ${lesson.title}`, sections[0]?.content ?? summary, minutes ? Math.max(5, Math.round(minutes * 0.45)) : null);
  const secondReading = reading(`${lesson.id}-reading-2`, sections[1]?.title ?? 'Key concepts and safety', sections[1]?.content ?? summary, minutes ? Math.max(5, Math.round(minutes * 0.35)) : null);
  const demo = demonstration(`${lesson.id}-demonstration`, 'See the robot concept in action', lesson.content?.robotConcept ?? 'Explore how the robot applies this concept.');

  if (lesson.ordinal === 1 && lesson.assignment?.constraints?.kind === 'knowledge_check') {
    return [firstReading, demo, secondReading, { id: `${lesson.id}-knowledge-check`, type: 'knowledge_check', title: lesson.assignment.title, description: lesson.assignment.instructions, durationMinutes: null, status: 'neutral', actionable: true, authoritative: true, action: 'knowledge_check' }];
  }

  if (lesson.ordinal === 5) {
    return [firstReading, { ...demo, title: 'Qualified Program Review' }, { id: `${lesson.id}-readiness`, type: 'physical_lab', title: 'Robot Readiness / Safety Check', description: 'Physical lab execution will become available when the robot runtime is authorized and ready.', durationMinutes: null, status: 'unavailable', actionable: false, authoritative: true, action: 'unavailable' }, { id: `${lesson.id}-physical`, type: 'physical_lab', title: 'Physical Experiment', description: 'Physical lab execution will become available when the robot runtime is authorized and ready.', durationMinutes: null, status: 'unavailable', actionable: false, authoritative: true, action: 'unavailable' }, { id: `${lesson.id}-evidence`, type: 'result', title: 'Result / Evidence', description: 'Evidence review will appear after an authorized experiment.', durationMinutes: null, status: 'neutral', actionable: false, authoritative: true, action: null }, { id: `${lesson.id}-reflection`, type: 'reflection', title: 'Reflection', description: 'Reflection will be available with the physical lab experience.', durationMinutes: null, status: 'neutral', actionable: false, authoritative: false, action: null }];
  }

  const simulationType: LessonActivityType = lesson.ordinal === 4 ? 'challenge' : 'simulation';
  const action: LessonActivity = { id: `${lesson.id}-guided-practice`, type: 'guided_practice', title: `Build your ${lesson.title} sequence`, description: lesson.assignment?.instructions ?? lesson.content?.taskPreview ?? 'Build the program in the existing practice flow.', durationMinutes: null, status: 'neutral', actionable: true, authoritative: true, action: 'practice' };
  return [firstReading, demo, action, { id: `${lesson.id}-simulation`, type: simulationType, title: lesson.assignment?.challengeTitle ?? lesson.content?.taskPreview ?? 'Authoritative simulation', description: lesson.assignment?.challengeDescription ?? 'Run the existing authoritative simulation.', durationMinutes: null, status: 'neutral', actionable: true, authoritative: true, action: 'practice' }, { id: `${lesson.id}-result`, type: 'result', title: 'Result / Feedback', description: 'Review the persisted evaluation result after practice.', durationMinutes: null, status: 'neutral', actionable: false, authoritative: true, action: null }];
}
