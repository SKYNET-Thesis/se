import React, { useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { SimulatedBadge } from '../components/ui/Badge';
import { CameraFocusView, CameraGrid, CameraLayoutToggle } from '../components/cameras/CameraViews';
import { Card } from '../components/ui/Card';
import { useLab } from '../contexts/LabContext';

export function Cameras() {
  const { cameras, reconnectCamera } = useLab();
  const [layout, setLayout] = useState<'grid' | 'focus'>('grid');
  const online = cameras.filter((c) => c.connection === 'connected');

  return (
    <div className="diagnostics-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="Cameras"
        description="Video sources recorded alongside joint telemetry. Each feed is written into the active dataset during recording."
        meta={<SimulatedBadge />}
        actions={
        <>
            <CameraLayoutToggle layout={layout} onChange={setLayout} />
            <Button
            icon={RefreshCwIcon}
            onClick={() => {
              const camera = cameras.find((candidate) => candidate.connection !== 'connected') ?? cameras[0];
              if (camera) reconnectCamera(camera.id);
            }}>
            
              Rescan video devices
            </Button>
          </>
        } />
      

      <Card className="diagnostic-summary px-5 py-3.5">
        <p className="text-base text-ink2">
          <span className="font-mono text-ink">{online.length}</span> of{' '}
          <span className="font-mono text-ink">{cameras.length}</span> configured cameras are streaming. Recording will
          save {online.length} synchronized video streams per episode.
        </p>
      </Card>

      {layout === 'grid' ? <CameraGrid cameras={cameras} /> : <CameraFocusView cameras={cameras} />}

      <Card className="p-5">
        <h2 className="text-md font-semibold text-ink">Troubleshooting a missing feed</h2>
        <ol className="mt-2 space-y-1.5 text-base text-ink2">
          <li>1. Confirm the device node exists on the host (for example <span className="font-mono text-sm text-ink">/dev/video6</span>).</li>
          <li>2. Check that no other process holds the camera open.</li>
          <li>3. Reseat the USB cable, preferring a powered hub for wrist cameras.</li>
          <li>4. Rescan video devices, then reassign the source in Workspace &amp; Ports.</li>
        </ol>
      </Card>
    </div>);

}
