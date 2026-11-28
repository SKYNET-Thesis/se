import { ConflictException } from '@nestjs/common';
import { AssignmentConfigService } from './assignment-config.service';

/** Owner policy 2026-11-28: no NEW mixed-grading configuration until a formula is approved; existing mixed records stay compatible. */
describe('mixed grading guard', () => {
  const build = (current: string | null) => {
    const update = jest.fn(async () => ({}));
    const prisma = { $queryRaw: jest.fn(async (strings: TemplateStringsArray) => (String(strings[0]).includes('SELECT grading_method') ? [{ grading_method: current }] : [{ max_score: null }])), learning_assignments: { update } };
    const svc = new AssignmentConfigService(prisma as never, {} as never);
    jest.spyOn(svc as never, 'authorize' as never).mockResolvedValue({ isQuiz: false } as never);
    jest.spyOn(svc as never, 'getAcademic' as never).mockResolvedValue({} as never);
    return { svc, update };
  };
  const user = {} as never;
  it('refuses to switch an automatic/manual/unset assignment to mixed', async () => {
    for (const current of ['automatic', 'manual', null]) {
      const t = build(current);
      await expect(t.svc.updateAcademic(user, 'c', 'a', { gradingMethod: 'mixed' } as never)).rejects.toMatchObject({ response: { code: 'MIXED_GRADING_NOT_AVAILABLE' } });
      expect(t.update).not.toHaveBeenCalled();
    }
  });
  it('keeps an existing mixed record usable (re-saving mixed is allowed) and still accepts automatic/manual', async () => {
    const t = build('mixed');
    await expect(t.svc.updateAcademic(user, 'c', 'a', { gradingMethod: 'mixed' } as never)).resolves.toBeDefined();
    expect(t.update).toHaveBeenCalled();
    for (const method of ['automatic', 'manual']) { const u = build('mixed'); await u.svc.updateAcademic(user, 'c', 'a', { gradingMethod: method } as never); expect(u.update).toHaveBeenCalled(); }
    expect(ConflictException).toBeDefined();
  });
});
