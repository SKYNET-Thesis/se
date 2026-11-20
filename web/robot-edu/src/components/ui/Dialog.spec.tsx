// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;

function Harness({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  // A fresh inline onClose on every render, exactly like the school dialogs pass.
  return (
    <Dialog open onClose={() => onClose()} title="Form">
      <input aria-label="First" value={a} onChange={(e) => setA(e.target.value)} />
      <input aria-label="Second" value={b} onChange={(e) => setB(e.target.value)} />
    </Dialog>
  );
}
const setValue = (input: HTMLInputElement, value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
const field = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

describe('Dialog focus', () => {
  beforeEach(() => { vi.useFakeTimers(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

  it('does not pull focus back to the first field when the parent re-renders with a new onClose', async () => {
    await act(async () => { root.render(<Harness onClose={() => undefined} />); });
    await act(async () => { vi.advanceTimersByTime(30); });
    expect(document.activeElement).toBe(field('First')); // initial autofocus still works
    field('Second').focus();
    await act(async () => { setValue(field('Second'), 'abc'); });
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(document.activeElement).toBe(field('Second'));
    expect(field('Second').value).toBe('abc');
  });

  it('closes on Escape using the latest handler', async () => {
    const onClose = vi.fn();
    await act(async () => { root.render(<Harness onClose={onClose} />); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
