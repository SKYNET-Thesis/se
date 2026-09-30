import { OctagonXIcon, ShieldIcon } from 'lucide-react';
import { Badge, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { deriveGesturePickMonitor } from '../../lib/gesturePickMonitor.js';
import type { BackendSnapshot, GesturePickDetection, GesturePickTaskState } from '../../lib/backend';

interface Props {
  state: Partial<GesturePickTaskState>;
  detections?: GesturePickDetection[];
  backendState?: BackendSnapshot['backend'];
  online?: boolean;
  now?: number;
  cancelling?: boolean;
  cancelError?: string | null;
  onCancel?: () => void;
}

export function GesturePickStatus({ state, detections = [], backendState, online = true,
  now = Date.now() / 1000, cancelling = false, cancelError, onCancel }: Props) {
  const view = deriveGesturePickMonitor({ status: state, detections }, backendState, { online, now, cancelling });
  const phaseTone: Tone = state.phase === 'held' || state.phase === 'failed' ? 'danger'
    : state.phase === 'executing' ? 'warn' : state.phase === 'succeeded' ? 'ok' : 'neutral';

  return <section aria-label="Task monitoring">
    <Card>
      <CardHeader title="Task status" icon={ShieldIcon} />
      <div className="space-y-5 p-5">
        <div aria-live="polite" aria-atomic="true" className="space-y-2">
          <Badge tone={phaseTone}>{view.phaseLabel}</Badge>
          <p className="text-xl font-semibold tracking-tight text-ink">{view.stageLabel}</p>
          {state.phase === 'preview' ? <p className="text-sm text-ink2">Review and confirm the selected tags in Quest.</p> : null}
          {state.phase === 'succeeded' ? <p className="text-sm text-ink2">Command sequence completed. Check the object placement in the camera.</p> : null}
        </div>
        <dl className="space-y-3 text-sm">
          <StatusRow label="Selected follower" value={state.followerSide ? `${state.followerSide === 'left' ? 'Left' : 'Right'} follower` : 'Not configured'} />
          <StatusRow label="Object" value={view.objectLabel} />
          <StatusRow label="Destination" value={view.boxLabel} />
          <StatusRow label="Calibration" value={view.calibrationLabel} />
          <StatusRow label="Camera" value={view.cameraLabel} />
          <StatusRow label="Frame age" value={view.frameAgeMs === null ? 'Unavailable' : `${view.frameAgeMs} ms`} />
          <StatusRow label="Motion gate" value={view.safetyLabel} />
        </dl>
        {state.taskId ? <p className="break-all border-t border-line pt-3 font-mono text-xs text-ink2">Task {state.taskId}</p> : null}
        {view.reason ? <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-ink">{view.reason}</p> : null}
        {cancelError ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-ink">Cancel request failed: {cancelError}</p> : null}
        <div className="space-y-2 border-t border-line pt-4">
          <Button variant="danger" icon={OctagonXIcon} className="w-full" disabled={!view.canCancel || !onCancel}
            aria-describedby="gesture-pick-cancel-note" aria-busy={cancelling} onClick={onCancel}>
            {cancelling ? 'Cancelling…' : 'Cancel task'}
          </Button>
          <p id="gesture-pick-cancel-note" className="text-sm text-ink2">Cancel requests Hold and stops subsequent stages.</p>
        </div>
      </div>
    </Card>
  </section>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4">
    <dt className="shrink-0 text-ink2">{label}</dt>
    <dd className="text-right font-medium text-ink">{value}</dd>
  </div>;
}
