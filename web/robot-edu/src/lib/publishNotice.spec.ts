import { describe, expect, it } from 'vitest';
import { publishNotice } from './publishNotice';

describe('publishNotice', () => {
  it('reports the synchronized enrollments returned by the all-or-nothing publication', () => {
    expect(publishNotice({ enrollmentSync: { classrooms: 3, enrolled: 6 } })).toBe('Course published. 6 student enrollments synchronized across 3 classrooms.');
    expect(publishNotice({ enrollmentSync: { classrooms: 1, enrolled: 1 } })).toBe('Course published. 1 student enrollment synchronized across 1 classroom.');
  });
  it('does not claim any enrollment when no classroom uses the course or the server sent no summary', () => {
    expect(publishNotice({ enrollmentSync: { classrooms: 0, enrolled: 0 } })).toContain('No active classroom');
    expect(publishNotice({})).toContain('No active classroom');
  });
});
