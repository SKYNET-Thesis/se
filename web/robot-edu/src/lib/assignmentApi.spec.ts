import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignmentApi } from './api';

describe('assignmentApi Gate 1 mutations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a draft through the classroom assignment endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'delivery-1', status: 'draft' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await assignmentApi.create('class-1', 'token', { lessonId: 'lesson-1', title: 'Draft' });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/classrooms/class-1/assignments'), expect.objectContaining({ method: 'POST' }));
  });

  it('publishes through the explicit classroom-scoped endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'delivery-1', status: 'published' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await (assignmentApi as unknown as { publish: Function }).publish('class-1', 'assignment-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/classrooms/class-1/assignments/assignment-1/publish'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
