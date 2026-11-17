import { describe, expect, it } from 'vitest';
import { displayText, readingPlan } from './lessonTeaching';
import type { LessonActivity } from './lessonActivities';

const act = (id: string, type: LessonActivity['type']): LessonActivity => ({ id, type, title: id, description: '', durationMinutes: null, status: 'neutral', actionable: true, authoritative: false, action: 'reading' });
const content = {
  summary: 'Identify safe robot-lab behaviour.',
  learningObjectives: ['Name the joints', 'Use the camera view'],
  conceptSections: [{ title: 'Anatomy', content: 'Links and joints.' }, { title: 'Workspace', content: 'Inspect first.' }, { title: 'Home & stop', content: 'Return home.' }],
  safetyNotes: ['Clear the workspace.', 'Hands out of reach.'],
};

describe('readingPlan (Course 1 readings)', () => {
  it('gives each of two readings its own sections, never repeating or dropping one', () => {
    const activities = [act('r1', 'reading'), act('d', 'demonstration'), act('r2', 'reading'), act('q', 'knowledge_check')];
    const first = readingPlan(content, activities, 'r1');
    const second = readingPlan(content, activities, 'r2');
    expect(first.sections.map((s) => s.title)).toEqual(['Anatomy']);
    expect(second.sections.map((s) => s.title)).toEqual(['Workspace', 'Home & stop']);
    expect(first.lead).toBe('Identify safe robot-lab behaviour.'); expect(first.objectives).toHaveLength(2); expect(first.safety).toEqual([]);
    expect(second.lead).toBeNull(); expect(second.objectives).toEqual([]); expect(second.safety).toEqual(['Clear the workspace.', 'Hands out of reach.']);
  });

  it('puts everything in a lesson’s only reading', () => {
    const plan = readingPlan(content, [act('r1', 'reading'), act('d', 'demonstration')], 'r1');
    expect(plan.sections).toHaveLength(3); expect(plan.safety).toHaveLength(2); expect(plan.lead).not.toBeNull();
  });

  it('copes with missing content', () => {
    expect(readingPlan(undefined, [act('r1', 'reading')], 'r1')).toEqual({ lead: null, objectives: [], sections: [], safety: [] });
  });

  it('only turns authored "->" arrows into arrows', () => {
    expect(displayText('home -> move to target -> wait')).toBe('home → move to target → wait');
    expect(displayText('x->y')).toBe('x->y');
  });
});
