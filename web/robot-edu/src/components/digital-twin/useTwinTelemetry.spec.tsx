// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTwinTelemetry } from './useTwinTelemetry';
import { SO101_NAMES } from './so101Model';
import type { TwinSnapshot } from './twinTelemetry';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string, readonly protocols?: string[]) { FakeSocket.instances.push(this); }
  close() { this.closed = true; }
  open() { this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  disconnect() { this.onclose?.(); }
}

let root: Root;
let host: HTMLDivElement;
let snapshot: TwinSnapshot;
function Probe({ scope = 'viewer-scope', expectedRobotId }: { scope?: string; expectedRobotId?: string }) { const state = useTwinTelemetry(scope, undefined, expectedRobotId); useEffect(() => { snapshot = state; }, [state]); return null; }
const frame = (sequence: number, measuredAt: string, robotId = 'so101-mock', sourceMode: 'SIMULATION' | 'LIVE_PHYSICAL' = 'SIMULATION') => ({
  schema_version: 1, robot_id: robotId, source_mode: sourceMode, controller_id: sourceMode === 'LIVE_PHYSICAL' ? 'lelab-owner' : 'offline-fixture',
  measured_at: measuredAt, sequence, connection: 'connected', calibration_status: sourceMode === 'LIVE_PHYSICAL' ? 'UNCALIBRATED' : 'NOT_APPLICABLE',
  measured: SO101_NAMES.map(name => ({ name, position: name === 'gripper' ? 20 : 0, unit: name === 'gripper' ? 'percent' : 'rad' })),
});

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mock WebSocket lifecycle', () => {
  it('rejects malformed and out-of-order frames, then becomes stale', async () => {
    const socket = FakeSocket.instances[0];
    expect(socket.protocols).toEqual(['vista.twin.viewer-scope']);
    await act(async () => socket.open());
    await act(async () => socket.message(frame(1, '2026-11-05T00:00:00Z')));
    expect(snapshot.fresh).toBe(true);
    await act(async () => socket.message(frame(0, '2026-11-05T00:00:00Z')));
    expect(snapshot.frame?.sequence).toBe(1);
    await act(async () => socket.message({ ...frame(2, '2026-11-05T00:00:00Z'), robot_id: 'physical' }));
    expect(snapshot.frame?.sequence).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1250));
    expect(snapshot.fresh).toBe(false);
  });
  it('disconnects, reconnects with a new stream and closes on unmount', async () => {
    const first = FakeSocket.instances.at(-1)!;
    await act(async () => { first.open(); first.message(frame(42, '2026-11-05T00:00:00Z')); first.disconnect(); });
    expect(snapshot.transport).toBe('disconnected'); expect(snapshot.fresh).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    const second = FakeSocket.instances.at(-1)!;
    expect(second).toBeDefined();
    await act(async () => { second.open(); second.message(frame(0, '2026-11-05T00:00:02Z')); });
    expect(snapshot.frame?.sequence).toBe(0); expect(snapshot.fresh).toBe(true);
    await act(async () => root.unmount());
    expect(second.closed).toBe(true);
    // Avoid a second unmount in afterEach.
    root = createRoot(host);
  });

  it('closes the old socket, clears state and ignores late telemetry when the selected robot changes', async () => {
    await act(async () => root.render(<Probe scope="scope-a" expectedRobotId="robot-a" />));
    const first = FakeSocket.instances.at(-1)!;
    await act(async () => { first.open(); first.message(frame(1, '2026-11-05T00:00:00Z', 'robot-a', 'LIVE_PHYSICAL')); });
    expect(snapshot.frame?.robot_id).toBe('robot-a');

    await act(async () => root.render(<Probe scope="scope-b" expectedRobotId="robot-b" />));
    expect(first.closed).toBe(true);
    expect(snapshot.frame).toBeNull();
    await act(async () => first.message(frame(2, '2026-11-05T00:00:01Z', 'robot-a', 'LIVE_PHYSICAL')));
    expect(snapshot.frame).toBeNull();

    const second = FakeSocket.instances.at(-1)!;
    await act(async () => { second.open(); second.message(frame(1, '2026-11-05T00:00:02Z', 'robot-a', 'LIVE_PHYSICAL')); });
    expect(snapshot.frame).toBeNull();
    await act(async () => second.message(frame(2, '2026-11-05T00:00:02Z', 'robot-b', 'LIVE_PHYSICAL')));
    expect(snapshot.frame?.robot_id).toBe('robot-b');
  });

  it('does not treat mock frames as physical telemetry for a selected robot', async () => {
    await act(async () => root.render(<Probe expectedRobotId="robot-a" />));
    const socket = FakeSocket.instances.at(-1)!;
    await act(async () => { socket.open(); socket.message(frame(1, '2026-11-05T00:00:00Z')); });
    expect(snapshot.frame).toBeNull();
    expect(snapshot.error).toContain('selected robot');
  });
});
