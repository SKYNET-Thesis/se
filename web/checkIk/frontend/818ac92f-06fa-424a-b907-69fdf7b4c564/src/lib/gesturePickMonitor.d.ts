import type { BackendSnapshot, GesturePickDetection, GesturePickTaskState } from './backend';

export function allowMotionReset(pathname: string): boolean;

export interface GesturePickMonitor {
  phaseLabel: string;
  stageLabel: string;
  reason: string | null;
  canCancel: boolean;
  calibrationLabel: string;
  cameraLabel: string;
  frameFresh: boolean;
  frameAgeMs: number | null;
  safetyLabel: string;
  objectLabel: string;
  boxLabel: string;
  tags: Array<GesturePickDetection & { selected: boolean; fresh: boolean }>;
}

export function deriveGesturePickMonitor(
  gesturePick: { status: Partial<GesturePickTaskState>; detections: GesturePickDetection[] } | undefined,
  backend: BackendSnapshot['backend'] | undefined,
  options: { online?: boolean; now: number; cancelling?: boolean },
): GesturePickMonitor;
