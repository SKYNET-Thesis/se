import { useEffect, useRef, useState } from 'react';
import { BoxesIcon } from 'lucide-react';
import { CameraFeedCard } from '../components/cameras/CameraFeedCard';
import { GesturePickStatus } from '../components/gesture-pick/GesturePickStatus';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { backend, type BackendSnapshot } from '../lib/backend';
import { deriveGesturePickMonitor } from '../lib/gesturePickMonitor.js';
import type { CameraDevice } from '../types';

export function GesturePick() {
  const [snapshot, setSnapshot] = useState<BackendSnapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const mounted = useRef(false);
  const cancellationPending = useRef(false);
  const version = useRef(0);
  const pollingRequest = useRef<AbortController | null>(null);
  const cancelRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let nextPoll: number | undefined;
    const clock = window.setInterval(() => setNow(Date.now() / 1000), 100);
    const poll = async () => {
      if (!cancellationPending.current) {
        const requestVersion = version.current;
        const controller = new AbortController();
        pollingRequest.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 2000);
        try {
          const result = await backend.status(controller.signal);
          if (!stopped && requestVersion === version.current) {
            setSnapshot(result);
            setOnline(true);
          }
        } catch {
          if (!stopped && requestVersion === version.current) setOnline(false);
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!stopped) nextPoll = window.setTimeout(() => void poll(), 300);
    };
    void poll();
    return () => {
      stopped = true;
      mounted.current = false;
      window.clearInterval(clock);
      window.clearTimeout(nextPoll);
      pollingRequest.current?.abort();
      cancelRequest.current?.abort();
    };
  }, []);

  const view = deriveGesturePickMonitor(snapshot?.gesturePick, snapshot?.backend, { online, now, cancelling });
  const state = snapshot?.gesturePick?.status;
  const liveCamera = snapshot?.cameras.find((camera) => camera.path === state?.cameraPath);
  const camera: CameraDevice = {
    id: 'gesture-pick-overhead', name: 'Overhead camera', role: 'overhead', recording: false,
    source: state?.cameraPath ?? '',
    connection: online && state?.cameraAvailable ? 'connected' : 'offline',
    resolution: liveCamera?.resolution ?? null, fps: liveCamera?.fps ?? null,
  };

  const cancel = async () => {
    if (!view.canCancel || cancellationPending.current) return;
    cancellationPending.current = true;
    version.current += 1;
    pollingRequest.current?.abort();
    setCancelling(true);
    setCancelError(null);
    const controller = new AbortController();
    cancelRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const result = await backend.cancelGesturePick(controller.signal);
      if (mounted.current) {
        setSnapshot(result);
        setOnline(true);
      }
    } catch (error) {
      if (mounted.current) setCancelError(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(timeout);
      cancellationPending.current = false;
      if (mounted.current) setCancelling(false);
    }
  };

  return <div className="control-page mx-auto max-w-[100rem] space-y-6">
    <PageHeader title="Gesture pick monitor" description="Watch the overhead camera and task stages. Object selection and motion confirmation happen in Quest."
      meta={<><Badge tone={online ? 'ok' : 'danger'}>{online ? 'Dashboard connected' : 'Dashboard unavailable'}</Badge><Badge>Monitoring only</Badge></>} />
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <section aria-label="Overhead camera" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">Tabletop view</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone={state?.calibrationValid ? 'ok' : 'warn'}>{view.calibrationLabel}</Badge>
              <Badge tone={view.frameFresh ? 'ok' : 'warn'}>{view.cameraLabel}{view.frameAgeMs === null ? '' : ` · ${view.frameAgeMs} ms`}</Badge>
            </div>
          </div>
          <CameraFeedCard camera={camera} large readOnly />
        </section>
        <Card>
          <CardHeader title="Detected tags" icon={BoxesIcon} description="Read-only observations in the calibrated follower frame." />
          {view.tags.length ? <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Visible object and destination tags, selection, freshness and robot coordinates in metres</caption>
              <thead className="border-b border-line bg-elev/50 text-ink2"><tr>
                <th scope="col" className="px-5 py-3 font-medium">Tag</th>
                <th scope="col" className="px-4 py-3 font-medium">Observation</th>
                <th scope="col" className="px-5 py-3 font-medium">Robot x / y / z (m)</th>
              </tr></thead>
              <tbody className="divide-y divide-line">{view.tags.map((tag) => <tr key={`${tag.kind}-${tag.tagId}`} className={tag.selected ? 'bg-brand/5' : ''}>
                <th scope="row" className="px-5 py-4 font-medium text-ink">
                  <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-3 w-3 border-2 ${tag.kind === 'object' ? 'border-vr' : 'rounded border-brand'}`} />{tag.kind === 'object' ? 'Object' : 'Box'} #{tag.tagId}</span>
                  {tag.selected ? <span className="mt-1 block text-xs text-brand">Selected in Quest</span> : null}
                </th>
                <td className="px-4 py-4"><Badge tone={tag.fresh ? 'ok' : 'warn'}>{tag.fresh ? 'Fresh' : 'Unavailable'}</Badge></td>
                <td className="whitespace-nowrap px-5 py-4 font-mono text-ink2">{tag.robotPoint.map((coordinate) => coordinate.toFixed(3)).join(' / ')}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="p-5 text-sm text-ink2">No visible configured tags. Keep the tagged cube and destination in the overhead camera view after table calibration.</p>}
        </Card>
      </div>
      <GesturePickStatus state={state ?? { phase: 'idle' }} detections={snapshot?.gesturePick?.detections}
        backendState={snapshot?.backend} online={online} now={now} cancelling={cancelling}
        cancelError={cancelError} onCancel={() => void cancel()} />
    </div>
  </div>;
}
