import type { WorkspaceProfile } from '../types';

export const initialWorkspaces: WorkspaceProfile[] = [
{
  id: 'ws-bench-a',
  name: 'Bimanual Bench A',
  description: 'Primary bimanual rig — two SO-101 leader/follower pairs, 4 cameras, Quest 3 operator station.',
  updatedAt: '22 Aug 2026 · 09:41',
  ports: {
    'left-leader': null,
    'left-follower': null,
    'right-leader': null,
    'right-follower': null
  },
  cameras: {
    overhead: '/dev/video0',
    'left-wrist': '/dev/video2',
    'right-wrist': '/dev/video4',
    front: '/dev/video6'
  },
  vrHeadsetId: 'quest3',
  mobileCompanionId: 'ipad',
  preferredMode: 'dual',
  safety: {
    maxSpeedPct: 60,
    jointLimits: 'workspace-profile',
    onConnectionLoss: 'hold-position',
    sessionTimeoutMin: 30
  },
  dirty: false
},
{
  id: 'ws-dual-lab',
  name: 'SO-101 Dual Arm Lab',
  description: 'Teaching rig in room 2.14 — shared between student groups, conservative speed limits.',
  updatedAt: '18 Aug 2026 · 16:02',
  ports: {
    'left-leader': null,
    'left-follower': null,
    'right-leader': null,
    'right-follower': null
  },
  cameras: {
    overhead: '/dev/video0',
    'left-wrist': '/dev/video2',
    'right-wrist': null,
    front: null
  },
  vrHeadsetId: null,
  mobileCompanionId: null,
  preferredMode: 'single',
  safety: {
    maxSpeedPct: 35,
    jointLimits: 'firmware-default',
    onConnectionLoss: 'release-torque',
    sessionTimeoutMin: 15
  },
  dirty: false
}];
