import { CameraOffIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { BACKEND_URL } from '../../lib/backend';
import type { CameraDevice } from '../../types';
import { Button } from '../ui/Button';

export function ObservationCameraRow({ camera }: { camera: CameraDevice }) {
  const { reconnectCamera } = useLab();
  const online = camera.connection === 'connected';
  const source = camera.source || 'No video device';
  const metadata = online
    ? `${camera.resolution ?? 'Unknown resolution'} · ${camera.fps ?? '—'} FPS`
    : `${source} · no signal`;

  return (
    <article className="observation-camera-row">
      <div className="observation-camera-row__thumbnail">
        {online ? <img src={`${BACKEND_URL}/api/cameras/stream?path=${encodeURIComponent(camera.source)}`} alt={`${camera.name} live stream`} /> : <CameraOffIcon className="h-4 w-4" aria-hidden />}
      </div>
      <div className="observation-camera-row__content">
        <p className="observation-camera-row__name">{camera.name}</p>
        <p className="observation-camera-row__metadata">{metadata}</p>
      </div>
      {online ? <span className="observation-camera-row__status"><span className="observation-camera-row__status-dot" aria-hidden />Streaming</span> : <Button size="sm" variant="ghost" className="observation-camera-row__reconnect" onClick={() => reconnectCamera(camera.id)}>Reconnect</Button>}
    </article>
  );
}
