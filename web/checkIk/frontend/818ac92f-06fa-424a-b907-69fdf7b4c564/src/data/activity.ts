import type { ActivityEvent } from '../types';

export const initialActivity: ActivityEvent[] = [
{
  id: 'a1',
  at: '09:41',
  kind: 'device',
  message: 'Right follower disconnected on /dev/ttyACM3 (port not present)',
  severity: 'danger'
},
{
  id: 'a2',
  at: '09:38',
  kind: 'training',
  message: 'Training job act_fold_towel_bimanual_v3 started · 10 000 steps',
  severity: 'info'
},
{
  id: 'a3',
  at: '09:12',
  kind: 'device',
  message: 'Left leader connected on /dev/ttyACM0',
  severity: 'success'
},
{
  id: 'a4',
  at: '08:57',
  kind: 'calibration',
  message: 'Calibration completed for left follower · profile left_follower_2026-08-14',
  severity: 'success'
},
{
  id: 'a5',
  at: '08:44',
  kind: 'dataset',
  message: 'Episode 62 saved to fold_towel_bimanual (41 s, 3 cameras)',
  severity: 'success'
},
{
  id: 'a6',
  at: '08:20',
  kind: 'vr',
  message: 'Meta Quest 3 paired to workspace Bimanual Bench A',
  severity: 'info'
},
{
  id: 'a7',
  at: 'Yesterday',
  kind: 'model',
  message: 'Model act_cube_handoff_v1 imported from local checkpoint',
  severity: 'info'
}];