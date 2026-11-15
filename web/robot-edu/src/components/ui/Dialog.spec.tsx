// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const render = async (node: React.ReactNode) => { await act(async () => { root.render(node); }); };
const portalRoot = () => document.body.querySelector('[role="dialog"]')?.parentElement as HTMLElement;

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('Dialog', () => {
  it('keeps its existing portal root classes when no className is given', async () => {
    await render(<Dialog open onClose={() => undefined} title="Plain">Body</Dialog>);
    expect(portalRoot().className).toBe('fixed inset-0 z-50 flex justify-center items-end p-0 sm:items-center sm:p-6');
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('adds an optional className to the portal root so a token scope reaches the panel', async () => {
    await render(<Dialog open onClose={() => undefined} title="Scoped" className="vista-school">Body</Dialog>);
    expect(portalRoot().classList.contains('vista-school')).toBe(true);
    expect(portalRoot().classList.contains('fixed')).toBe(true);
    expect(portalRoot().contains(document.body.querySelector('[role="dialog"]'))).toBe(true);
  });

  it('still closes on Escape', async () => {
    const onClose = vi.fn();
    await render(<Dialog open onClose={onClose} title="Escape" className="vista-school">Body</Dialog>);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps focus where the user put it when the parent re-renders with a new inline onClose', async () => {
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus();
    const view = (label: string) => <Dialog open onClose={() => undefined} title="Focus"><input aria-label="first" /><input aria-label={label} /></Dialog>;
    await render(view('second'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    const second = document.body.querySelector('input[aria-label="second"]') as HTMLInputElement;
    second.focus();
    await render(view('second ')); // new props and a new onClose function
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.activeElement).toBe(document.body.querySelector('input[aria-label="second "]'));
    const onClose = vi.fn();
    await render(<Dialog open onClose={onClose} title="Focus"><input aria-label="first" /></Dialog>);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1); // Escape uses the latest onClose
    opener.remove();
  });
});
