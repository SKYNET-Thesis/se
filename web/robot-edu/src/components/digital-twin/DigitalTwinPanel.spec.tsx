// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DigitalTwinPanel } from './DigitalTwinPanel';

vi.mock('./useTwinTelemetry', () => ({ useTwinTelemetry: () => ({ frame: null, transport: 'disconnected', ageMs: null, fresh: false, error: null }) }));
vi.mock('./So101DigitalTwinViewer', () => ({ So101DigitalTwinViewer: () => <div data-testid="twin-canvas" /> }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; });

describe('Robot Lab Digital Twin panel', () => {
  it('labels mock data and provides no physical control actions', async () => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => root?.render(<DigitalTwinPanel />));
    expect(host.textContent).toContain('SIMULATION — MOCK DATA');
    expect(host.textContent).toContain('Gripper percentage never maps to Jaw');
    expect(host.querySelector('[data-testid="twin-canvas"]')).not.toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });
});
