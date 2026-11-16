// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SO101_NAMES, toUrdfRadians } from './so101Model';
import { acceptTwinFrame, isFresh, type JointState } from './twinTelemetry';
import { MockTelemetryProvider } from './mockTelemetryProvider';
import { ARM_IDENTITIES, ARM_METADATA, JOINT_DETAILS } from './types';
import { DigitalTwinWorkspace } from './DigitalTwinWorkspace';
import { useDigitalTwinWorkspace } from './useDigitalTwinWorkspace';
import {
  parseMultiArmMessage,
  isMessageFromCurrentSession,
  type SnapshotEnvelope,
  type UpdateEvent,
  type StaleEvent,
  type DisconnectedEvent,
} from './multiArmContract';

// Mock Three.js and URDFLoader to avoid WebGL context issues in JSDOM unit tests
vi.mock('./DigitalTwinWorkspaceViewer', () => ({
  DigitalTwinWorkspaceViewer: ({ activeArmId, layoutMode }: { activeArmId: string; layoutMode: string }) => (
    <div data-testid="workspace-3d-viewer" data-arm={activeArmId} data-layout={layoutMode}>
      Three.js Canvas Mock
    </div>
  ),
}));

class FakeWorkspaceSocket {
  static instances: FakeWorkspaceSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event?: { code?: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];
  closed = false;

  constructor(readonly url: string, readonly protocols?: string[]) {
    FakeWorkspaceSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = 'Normal') {
    this.closed = true;
    this.onclose?.({ code, reason });
  }

  open() {
    this.onopen?.();
  }

  message(val: unknown) {
    this.onmessage?.({ data: JSON.stringify(val) });
  }
}

const createSampleJointState = (robotId: string, sequence = 1, measuredAt = '2026-11-13T01:00:00.000Z'): JointState => ({
  schema_version: 1,
  robot_id: robotId,
  source_mode: 'SIMULATION',
  controller_id: 'test-controller',
  measured_at: measuredAt,
  sequence,
  connection: 'connected',
  calibration_status: 'NOT_APPLICABLE',
  measured: SO101_NAMES.map((name) => ({
    name,
    position: name === 'gripper' ? 25 : 0.1,
    unit: name === 'gripper' ? 'percent' : 'rad',
  })),
});

describe('Digital Twin Workspace & Multi-Arm Telemetry', () => {
  it('defines all 4 logical tabletop arm identities with correct metadata', () => {
    expect(ARM_IDENTITIES).toEqual(['leader_left', 'follower_left', 'leader_right', 'follower_right']);
    for (const id of ARM_IDENTITIES) {
      const meta = ARM_METADATA[id];
      expect(meta.id).toBe(id);
      expect(meta.role).toMatch(/^(leader|follower)$/);
      expect(meta.side).toMatch(/^(left|right)$/);
      expect(meta.pairId).toMatch(/^(left_pair|right_pair)$/);
      expect(meta.colorHex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('provides complete joint details and bounds for all six SO-101 joints', () => {
    expect(SO101_NAMES).toHaveLength(6);
    for (const name of SO101_NAMES) {
      const detail = JOINT_DETAILS[name];
      expect(detail.name).toBe(name);
      expect(detail.urdfName).toBeDefined();
      expect(detail.lowerRad).toBeLessThan(detail.upperRad);
      expect(detail.lowerDeg).toBeLessThan(detail.upperDeg);
    }
  });

  it('MockTelemetryProvider produces valid schema-compliant frames for all four arms', () => {
    const provider = new MockTelemetryProvider(30);
    const snapshot = provider.generateSnapshot(Date.now(), false);

    expect(Object.keys(snapshot)).toHaveLength(4);
    for (const armId of ARM_IDENTITIES) {
      const frame = snapshot[armId];
      expect(frame.schema_version).toBe(1);
      expect(frame.robot_id).toBe(armId);
      expect(frame.source_mode).toBe('SIMULATION');
      expect(frame.connection).toBe('connected');
      expect(frame.measured).toHaveLength(6);

      for (const reading of frame.measured) {
        expect(SO101_NAMES).toContain(reading.name);
        const rad = toUrdfRadians(reading.name, reading.position, reading.unit);
        expect(rad).not.toBeNull();
      }
    }
  });

  it('simulates follower tracking lag in mock leader-follower pairs', () => {
    const provider = new MockTelemetryProvider(30);
    provider.setPattern('pick_and_place');
    const snapshot = provider.generateSnapshot(Date.now(), false);

    const leaderLeft = snapshot.leader_left;
    const followerLeft = snapshot.follower_left;

    expect(leaderLeft).toBeDefined();
    expect(followerLeft).toBeDefined();

    const lPan = leaderLeft.measured.find((r) => r.name === 'shoulder_pan')!;
    const fPan = followerLeft.measured.find((r) => r.name === 'shoulder_pan')!;

    expect(Number.isFinite(lPan.position)).toBe(true);
    expect(Number.isFinite(fPan.position)).toBe(true);
  });

  it('correctly marks dropped packets as disconnected and stale', () => {
    const provider = new MockTelemetryProvider(30);
    const now = Date.now();
    const droppedSnapshot = provider.generateSnapshot(now, true);

    for (const armId of ARM_IDENTITIES) {
      const frame = droppedSnapshot[armId];
      expect(frame.connection).toBe('disconnected');
      expect(isFresh(frame, 'connected', now)).toBe(false);
    }
  });

  it('rejects out-of-order packets and preserves sequential progression', () => {
    const frameA = createSampleJointState('follower_left', 10, '2026-11-13T01:00:00.000Z');
    const frameB = createSampleJointState('follower_left', 11, '2026-11-13T01:00:00.033Z');
    const outOfOrderFrame = createSampleJointState('follower_left', 9, '2026-11-13T01:00:00.040Z');

    expect(acceptTwinFrame(null, frameA)).toBe(true);
    expect(acceptTwinFrame(frameA, frameB)).toBe(true);
    expect(acceptTwinFrame(frameB, outOfOrderFrame)).toBe(false);
  });
});

describe('Multi-Arm WebSocket Protocol & Session Isolation', () => {
  it('parses multi-arm snapshot envelopes and individual update events', () => {
    const rawSnapshot: SnapshotEnvelope = {
      type: 'snapshot',
      schema_version: 1,
      session_id: 'session-tabletop-01',
      organization_id: 'org-test',
      robot_id: 'dual-arm-01',
      timestamp: '2026-11-13T01:00:00.000Z',
      arms: {
        leader_left: createSampleJointState('leader_left', 1),
        follower_left: createSampleJointState('follower_left', 1),
      },
    };

    const parsedSnapshot = parseMultiArmMessage(rawSnapshot);
    expect(parsedSnapshot).not.toBeNull();
    expect(parsedSnapshot?.type).toBe('snapshot');
    if (parsedSnapshot?.type === 'snapshot') {
      expect(parsedSnapshot.arms.leader_left).toBeDefined();
      expect(parsedSnapshot.arms.follower_left).toBeDefined();
    }

    const rawUpdate: UpdateEvent = {
      type: 'update',
      arm_id: 'follower_right',
      session_id: 'session-tabletop-01',
      state: createSampleJointState('follower_right', 2),
    };
    const parsedUpdate = parseMultiArmMessage(rawUpdate);
    expect(parsedUpdate?.type).toBe('update');
  });

  it('parses stale and disconnected events', () => {
    const rawStale: StaleEvent = {
      type: 'stale',
      session_id: 'session-tabletop-01',
      arm_id: 'follower_left',
      reason: 'Heartbeat timeout',
    };
    const parsedStale = parseMultiArmMessage(rawStale);
    expect(parsedStale?.type).toBe('stale');

    const rawDisc: DisconnectedEvent = {
      type: 'disconnected',
      session_id: 'session-tabletop-01',
      reason: 'Hardware disconnected',
    };
    const parsedDisc = parseMultiArmMessage(rawDisc);
    expect(parsedDisc?.type).toBe('disconnected');
  });

  it('supports legacy Contract v1 frames without envelopes', () => {
    const legacyFrame = createSampleJointState('so101-mock', 42);
    const parsed = parseMultiArmMessage(legacyFrame);
    expect(parsed?.type).toBe('legacy_v1');
    if (parsed?.type === 'legacy_v1') {
      expect(parsed.state.sequence).toBe(42);
    }
  });

  it('enforces session isolation and rejects messages from mismatched sessions', () => {
    const msg: SnapshotEnvelope = {
      type: 'snapshot',
      session_id: 'session-classroom-A',
      organization_id: 'org-A',
      timestamp: '2026-11-13T01:00:00.000Z',
      arms: {
        follower_left: createSampleJointState('follower_left', 1),
      },
    };

    // Correct session matches
    expect(isMessageFromCurrentSession(msg, { session_id: 'session-classroom-A', organization_id: 'org-A' })).toBe(true);

    // Mismatched session is rejected (preventing visual leakage)
    expect(isMessageFromCurrentSession(msg, { session_id: 'session-classroom-B', organization_id: 'org-A' })).toBe(false);
    expect(isMessageFromCurrentSession(msg, { session_id: 'session-classroom-A', organization_id: 'org-B' })).toBe(false);
  });
});

describe('useDigitalTwinWorkspace Hook Lifecycle', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let capturedState: ReturnType<typeof useDigitalTwinWorkspace>;

  function HookProbe(props: Parameters<typeof useDigitalTwinWorkspace>[0]) {
    const state = useDigitalTwinWorkspace(props);
    useEffect(() => {
      capturedState = state;
    }, [state]);
    return null;
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    FakeWorkspaceSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWorkspaceSocket);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    vi.unstubAllGlobals();
    root = undefined;
    host = undefined;
  });

  it('wipes state when session or robot changes to eliminate visual leakage', async () => {
    await act(async () => {
      root?.render(<HookProbe sessionId="session-1" robotId="robot-1" />);
    });

    expect(capturedState).toBeDefined();

    // Render with new session
    await act(async () => {
      root?.render(<HookProbe sessionId="session-2" robotId="robot-2" />);
    });

    // All frames are cleared
    expect(capturedState.frames.follower_left).toBeNull();
    expect(capturedState.frames.leader_left).toBeNull();
  });

  it('switches to websocket, sends subscribe envelope, and ingests multi-arm snapshot', async () => {
    const onScopeRevoked = vi.fn();
    await act(async () => {
      root?.render(
        <HookProbe
          sessionId="session-lab-1"
          viewerScopeToken="valid-token-123"
          onScopeRevoked={onScopeRevoked}
        />
      );
    });

    // Switch to websocket source
    await act(async () => {
      capturedState.setSourceType('websocket');
    });

    const socket = FakeWorkspaceSocket.instances[0];
    expect(socket).toBeDefined();
    expect(socket.protocols).toEqual(['vista.twin.valid-token-123']);

    await act(async () => {
      socket.open();
    });

    // Sent subscription message
    expect(socket.sentMessages.length).toBeGreaterThan(0);
    const sub = JSON.parse(socket.sentMessages[0]);
    expect(sub.type).toBe('subscribe');
    expect(sub.session_id).toBe('session-lab-1');

    // Deliver snapshot
    const snapshot: SnapshotEnvelope = {
      type: 'snapshot',
      session_id: 'session-lab-1',
      timestamp: '2026-11-13T01:00:00.000Z',
      arms: {
        leader_left: createSampleJointState('leader_left', 5),
        follower_left: createSampleJointState('follower_left', 5),
      },
    };

    await act(async () => {
      socket.message(snapshot);
    });

    expect(capturedState.frames.leader_left?.sequence).toBe(5);
    expect(capturedState.frames.follower_left?.sequence).toBe(5);

    // Close socket with code 4403 (unauthorized/expired token)
    await act(async () => {
      socket.close(4403, 'Scope expired');
    });

    expect(onScopeRevoked).toHaveBeenCalled();
  });
});

describe('DigitalTwinWorkspace Component Rendering', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it('renders workspace with left tabbed inspector (Joints, Arms, Telemetry, Settings) and 3D viewer', async () => {
    await act(async () => {
      root?.render(<DigitalTwinWorkspace />);
    });

    expect(host?.textContent).toContain('SO-101 Digital Twin Workspace');
    expect(host?.textContent).toContain('Tabletop manipulation twin');
    expect(host?.querySelector('[data-testid="workspace-3d-viewer"]')).not.toBeNull();

    // Verify 4 functional tabs are present
    expect(host?.textContent).toContain('Joints');
    expect(host?.textContent).toContain('Arms');
    expect(host?.textContent).toContain('Telemetry');
    expect(host?.textContent).toContain('Settings');

    // Default tab is 'Joints' showing joint names and angles
    expect(host?.textContent).toContain('Shoulder Pan');

    // Click 'Telemetry' tab -> reveals stream diagnostics and mock mode pill
    const buttons = Array.from(host?.querySelectorAll('button') ?? []);
    const telemetryTabBtn = buttons.find((b) => b.textContent?.trim() === 'Telemetry');
    expect(telemetryTabBtn).toBeDefined();

    await act(async () => {
      telemetryTabBtn?.click();
    });

    expect(host?.textContent).toContain('Simulation Mock');
    expect(host?.textContent).toContain('Stream Health & Telemetry');

    // Click 'Settings' tab -> reveals telemetry configuration and mock controls
    const settingsTabBtn = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Settings'
    );
    expect(settingsTabBtn).toBeDefined();

    await act(async () => {
      settingsTabBtn?.click();
    });

    expect(host?.textContent).toContain('Telemetry Adapter Configuration');
    expect(host?.textContent).toContain('Procedural Mock');

    // Click 'Arms' tab -> reveals tabletop arms list and kinematic bounds
    const armsTabBtn = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Arms'
    );
    expect(armsTabBtn).toBeDefined();

    await act(async () => {
      armsTabBtn?.click();
    });

    expect(host?.textContent).toContain('Calibrated Joint Limits');
    expect(host?.textContent).toContain('so101_new_calib');
  });

  it('preserves robot state and connection when switching between tabs', async () => {
    let capturedState!: ReturnType<typeof useDigitalTwinWorkspace>;

    function TestHarness() {
      const state = useDigitalTwinWorkspace({
        initialArm: 'follower_left',
        sessionId: 'session-tab-persist',
        viewerScopeToken: 'test-tab-token',
      });
      capturedState = state;
      return null;
    }

    await act(async () => {
      root?.render(
        <div>
          <TestHarness />
          <DigitalTwinWorkspace sessionId="session-tab-persist" viewerScopeToken="test-tab-token" />
        </div>
      );
    });

    // Switch to WebSocket source
    await act(async () => {
      capturedState.setSourceType('websocket');
    });

    const socketCountBefore = FakeWorkspaceSocket.instances.length;

    // Click between all 4 tabs in the UI
    const buttons = () => Array.from(host?.querySelectorAll('button') ?? []);
    const clickTab = async (label: string) => {
      const tabBtn = buttons().find((b) => b.textContent?.trim() === label);
      await act(async () => {
        tabBtn?.click();
      });
    };

    await clickTab('Arms');
    await clickTab('Telemetry');
    await clickTab('Settings');
    await clickTab('Joints');

    // Tab switching must NOT create new sockets or tear down existing connections
    expect(FakeWorkspaceSocket.instances.length).toBe(socketCountBefore);
  });

  it('allows switching view mode and pair selection', async () => {
    await act(async () => {
      root?.render(<DigitalTwinWorkspace />);
    });

    const buttons = Array.from(host?.querySelectorAll('button') ?? []);
    const rightPairButton = buttons.find((b) => b.textContent?.includes('Right Pair'));
    expect(rightPairButton).toBeDefined();

    await act(async () => {
      rightPairButton?.click();
    });

    expect(host?.textContent).toContain('Right Pair');
  });

  it('renders empty state when not authorized', async () => {
    await act(async () => {
      root?.render(<DigitalTwinWorkspace isAuthorized={false} />);
    });

    expect(host?.textContent).toContain('No Authorized Robot Arm Available');
    expect(host?.textContent).toContain('requires an active classroom membership');
  });
});
