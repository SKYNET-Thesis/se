import { CameraOffIcon, ExpandIcon, VideoIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cx } from '../../lib/format';
import type { CameraDevice } from '../../types';
import { BACKEND_URL } from '../../lib/backend';

export function CameraFeedCard({
  camera,
  large = false,
  onFocus




}: {camera: CameraDevice;large?: boolean;onFocus?: () => void;}) {
  const { reconnectCamera, session } = useLab();
  const online = camera.connection === 'connected';
  const recording = session?.recording ?? camera.recording;

  return (
    <figure className="camera-feed overflow-hidden rounded-xl border bg-card">
      <div className={cx('relative w-full', large ? 'aspect-[16/9]' : 'aspect-video')}>
        {online ?
        <img
          src={`${BACKEND_URL}/api/cameras/stream?path=${encodeURIComponent(camera.source)}`}
          alt={`${camera.name} live stream`}
          className="absolute inset-0 h-full w-full bg-black object-contain"
        /> :

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-subtle px-4 text-center">
            <CameraOffIcon className="h-5 w-5 text-faint" />
            <p className="text-sm font-medium text-ink2">No signal</p>
            <p className="text-xs text-faint">
              {camera.source} is not streaming. Check the USB cable, then rescan video devices.
            </p>
            <Button size="sm" onClick={() => reconnectCamera(camera.id)}>
              Reconnect
            </Button>
          </div>
        }

        {online ?
        <>
            <div className="absolute left-2 top-2 flex items-center gap-1.5">
              <span className="rounded-md bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
                {camera.name}
              </span>
              {recording ?
            <span className="inline-flex items-center gap-1 rounded-md bg-danger/85 px-1.5 py-0.5 text-xs font-semibold text-white">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                  REC
                </span> :
            null}
            </div>
            <span className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-0.5 font-mono text-xs text-white">
              {camera.resolution} · {camera.fps} fps
            </span>
            {onFocus ?
          <button
            type="button"
            onClick={onFocus}
            aria-label={`Focus ${camera.name} camera`}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/65 text-white transition-colors duration-150 ease-smooth hover:bg-black/80">
            
                <ExpandIcon className="h-4 w-4" />
              </button> :
          null}
          </> :
        null}
      </div>
      <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <VideoIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="truncate text-sm text-ink">{camera.name}</span>
          <span className="truncate font-mono text-xs text-faint">{camera.source}</span>
        </span>
        {online ? <Badge tone="ok">Streaming</Badge> : <Badge tone="danger">No signal</Badge>}
      </figcaption>
    </figure>);

}
