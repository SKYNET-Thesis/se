/** Compact authoring helpers for the SO-101 curriculum pack. Platform mapping: course -> module (learning_lessons) -> lesson (section) -> module-end quiz. */
export interface QuestionSpec { code: string; objective: string; type: 'single_choice' | 'multiple_choice' | 'true_false'; difficulty: 'easy' | 'medium' | 'hard'; weight: number; stem: string; options: Array<{ id: string; text: string }>; answer: string[]; explanation: string }
export interface LessonSpec { title: string; objectives: [string, string]; instructorGuidance: string; blocks: Array<{ type: 'heading' | 'paragraph'; text: string }> }
export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export interface AssignmentSpec { title: string; instructions: string; difficulty: Level; type: 'knowledge' | 'blockly' | 'simulation' | 'manual_final'; grading: 'automatic' | 'manual' | 'mixed'; passScore: number; objectives: string[]; rubric: Array<{ title: string; description: string; maxPoints: number }> }
export interface LabSpec extends AssignmentSpec {
  challenge: { title: string; description: string; allowedBlocks: string[]; target?: { arm: 'left' | 'right'; x: number; y: number; z: number }; conditions: Array<{ ruleKey: string; ruleConfig: Record<string, unknown>; description: string }> };
}
export interface ModuleSpec { title: string; summary: string; lessons: [LessonSpec, LessonSpec]; quiz: { title: string; passPercent: number; questions: QuestionSpec[] } }
export interface CourseSpec { title: string; description: string; level: Level; tags: string[]; prerequisiteIndex: number | null; modules: [ModuleSpec, ModuleSpec, ModuleSpec]; assignments: [AssignmentSpec, AssignmentSpec]; labs: [LabSpec, LabSpec] }

/** [lesson index 0|1, objective index 0|1], type s|m|t, difficulty e|m|h, weight, stem, options, answer letters (or t/f), explanation */
export type Q = [[0 | 1, 0 | 1], 's' | 'm' | 't', 'e' | 'm' | 'h', number, string, string[], string, string];
const DIFF = { e: 'easy', m: 'medium', h: 'hard' } as const;
const ID = 'abcdef';

export function module(prefix: string, title: string, summary: string, lessons: [LessonSpec, LessonSpec], quizTitle: string, passPercent: number, qs: Q[]): ModuleSpec {
  if (qs.length !== 20) throw new Error(`${prefix}: a module quiz needs exactly 20 questions (got ${qs.length})`);
  const questions: QuestionSpec[] = qs.map(([[li, oi], t, d, weight, stem, texts, ans, explanation], n) => {
    const type = t === 's' ? 'single_choice' : t === 'm' ? 'multiple_choice' : 'true_false';
    const options = t === 't' ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : texts.map((text, i) => ({ id: ID[i], text }));
    const answer = t === 't' ? [ans === 't' ? 'true' : 'false'] : ans.split('');
    return { code: `${prefix}-Q${String(n + 1).padStart(2, '0')}`, objective: lessons[li].objectives[oi], type, difficulty: DIFF[d], weight, stem, options, answer, explanation };
  });
  return { title, summary, lessons, quiz: { title: quizTitle, passPercent, questions } };
}
export const L = (title: string, objectives: [string, string], instructorGuidance: string, ...paragraphs: string[]): LessonSpec =>
  ({ title, objectives, instructorGuidance, blocks: [{ type: 'heading', text: title }, ...paragraphs.map((text) => ({ type: 'paragraph' as const, text }))] });
