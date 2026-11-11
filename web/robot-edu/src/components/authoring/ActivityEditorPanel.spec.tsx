// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityEditorPanel, type ActivityEditorDraft } from './ActivityEditorPanel';

const draft: ActivityEditorDraft = { title: 'Safety reading', type: 'reading', required: true, contentRef: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [] } };
let root: Root;
let host: HTMLDivElement;
function mount(activityDraft: ActivityEditorDraft, onChange = vi.fn()) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => root.render(<QueryClientProvider client={client}><ActivityEditorPanel courseId="course-1" token="token" draft={activityDraft} onChange={onChange} onSave={vi.fn()} onCancel={vi.fn()} saving={false} /></QueryClientProvider>));
  return { onChange, host };
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('ActivityEditorPanel', () => {
  it('adds structured reading blocks to the persisted draft', () => {
    const { onChange, host: element } = mount(draft);
    const button = [...element.querySelectorAll('button')].find((item) => item.textContent === 'Add paragraph');
    act(() => button?.click());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ content: { version: 1, blocks: [{ type: 'paragraph', text: '' }], mediaIds: [] } }));
  });

  it('offers a real authorized media library and allows video draft save', () => {
    const { host: element } = mount({ ...draft, type: 'video', content: {} });
    expect(element.textContent).toContain('Browse or upload video');
    expect([...element.querySelectorAll('label')].some((label) => /video url/i.test(label.textContent ?? ''))).toBe(false);
    const save = [...element.querySelectorAll('button')].find((button) => button.textContent === 'Save Draft');
    expect(save?.hasAttribute('disabled')).toBe(false);
  });
});
