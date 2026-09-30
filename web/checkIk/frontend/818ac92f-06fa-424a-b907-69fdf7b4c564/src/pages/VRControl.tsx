import React, { useState } from 'react';
import {
  BatteryMediumIcon,
  CopyIcon,
  CrosshairIcon,
  ExternalLinkIcon,
  GlassesIcon,
  HandIcon,
  InfoIcon,
  PlayIcon,
  ScanIcon,
  ShieldIcon,
  SlidersHorizontalIcon } from
'lucide-react';
import { PageHeader, Section } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SideBadge } from '../components/ui/Badge';
import { Slider } from '../components/ui/Field';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness } from '../hooks/useLabDerived';
import { NOT_AVAILABLE } from '../lib/format';

export function VRControl() {
  const { headset, capabilities, toast, startSession, startLeKiwiVR, backendOnline, backendTask } = useLab();
  const pairs = useArmPairReadiness();
  const [implementation, setImplementation] = useState<'vr_control' | 'vr_lekiwi'>('vr_lekiwi');
  const [armMode, setArmMode] = useState<'left-only' | 'right-only' | 'dual-arm'>('dual-arm');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right'>('left');
  const [scale, setScale] = useState(45);
  const [responseProfile, setResponseProfile] = useState<'smooth' | 'balanced' | 'fast'>('balanced');
  const supported = capabilities.supportsVRControl;

  return (
    <div className="vr-control-page control-page mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        title="VR control"
        description="Use the tested LeKiwi WebXR operator surface from CHECKIK."
        meta={
        <Badge tone={supported ? 'ok' : 'warn'}>
            {supported ? 'Backend VR bridge available' : 'Demonstration mode — backend has no VR bridge'}
          </Badge>
        }
      />

      <Card className="vr-selection-card">
        <CardHeader title="VR implementation" description="The backend selection is the source of truth for the active session." />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="space-y-2 text-sm text-ink2">
            <span className="block font-medium text-ink">Implementation</span>
            <select className="w-full rounded-lg border border-line bg-elev px-3 py-2 text-ink" value={implementation} onChange={(event) => setImplementation(event.target.value as typeof implementation)}>
              <option value="vr_lekiwi">VR LeKiwi</option>
              <option value="vr_control">VR Control</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-ink2">
            <span className="block font-medium text-ink">Arm mode</span>
            <select className="w-full rounded-lg border border-line bg-elev px-3 py-2 text-ink" value={armMode} onChange={(event) => setArmMode(event.target.value as typeof armMode)}>
              <option value="dual-arm">Dual-arm</option>
              <option value="left-only">Left-only</option>
              <option value="right-only">Right-only</option>
            </select>
          </label>
        </div>
        <div className="vr-status-grid grid gap-3 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-5">
          <StatusRow label="Implementation" value={backendTask?.implementation ?? 'none'} />
          <StatusRow label="Mode" value={backendTask?.mode ?? 'none'} />
          <StatusRow label="Active arms" value={backendTask?.activeArms?.join(' + ') ?? 'none'} />
          <StatusRow label="Process" value={backendTask?.processHealth ?? (backendTask?.running ? 'starting' : 'idle')} />
          <StatusRow label="Relay" value={backendTask?.relayHealth ?? 'not-configured'} />
        </div>
        {backendTask?.implementation === 'vr_lekiwi' && backendTask.operatorUrl ? <div className="flex flex-wrap items-center gap-2 border-t border-line p-5">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={backendTask.operatorUrl}>{backendTask.operatorUrl}</span>
          <Button size="sm" icon={ExternalLinkIcon} onClick={() => window.open(backendTask.operatorUrl ?? '', '_blank', 'noopener,noreferrer')}>Open</Button>
          <Button size="sm" icon={CopyIcon} onClick={() => void navigator.clipboard?.writeText(backendTask.operatorUrl ?? '')}>Copy</Button>
        </div> : null}
        {backendTask?.lastError ? <p className="border-t border-line px-5 py-3 text-sm text-danger">{backendTask.lastError}</p> : null}
      </Card>
      

      {!supported ?
      <div className="vr-alert flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn/[0.07] p-4 sm:flex-row sm:items-center">
          <InfoIcon className="h-5 w-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">
              VR teleoperation is not implemented by {capabilities.backendName} {capabilities.backendVersion}
            </p>
            <p className="mt-0.5 text-sm text-ink2">
              The headset below is genuinely paired to this host, but no controller-to-arm command path exists yet.
              Everything on this page is a labelled preview of the planned mapping — starting a VR session will not move
              hardware.
            </p>
          </div>
        </div> :
      null}

      <div className="vr-workspace-grid grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card accent="vr" className="vr-device-card">
          <CardHeader title="Headset" icon={GlassesIcon} accentColor="#38bdf8" actions={<Badge tone={headset.connected ? 'ok' : 'neutral'}>{headset.connected ? 'Connected' : 'Not paired'}</Badge>} />
          <dl className="space-y-2 p-5 text-sm">
            <Row label="Device" value={headset.name} />
            <Row label="Battery" value={headset.batteryPct !== null ? `${headset.batteryPct}%` : NOT_AVAILABLE} />
            <Row label="Refresh rate" value={headset.refreshHz ? `${headset.refreshHz} Hz` : NOT_AVAILABLE} />
            <Row label="Wi-Fi" value={headset.wifiQuality ?? NOT_AVAILABLE} />
            <Row label="Tracking" value={headset.trackingQuality ?? NOT_AVAILABLE} />
            <Row label="Network latency" value={headset.latencyMs ? `${headset.latencyMs} ms` : NOT_AVAILABLE} />
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
            <Button variant="primary" size="sm" icon={ScanIcon} onClick={() => toast({ title: 'Open this Vuer URL in the Quest browser', detail: 'https://<laptop-ip>:8012/?ws=wss://<laptop-ip>:8012', tone: 'info' })}>
              Open Quest instructions
            </Button>
          </div>
        </Card>

        <Card className="vr-controller-surface vr-controller-deck">
          <CardHeader title="Controllers" description={headset.connected ? 'Live Quest input' : 'Controllers appear after the headset connects'} />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
          {headset.controllers.map((c) =>
          <div key={c.side} className="vr-controller-card rounded-xl border border-line bg-elev/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <SideBadge side={c.side} />
              <Badge tone={c.connected ? 'ok' : 'neutral'}>{c.connected ? 'Tracked' : 'Not detected'}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Row
              label="Battery"
              value={c.batteryPct !== null ? `${c.batteryPct}%` : NOT_AVAILABLE}
              icon={BatteryMediumIcon} />
            
              <Row label="Tracking confidence" value={c.trackingConfidence ?? NOT_AVAILABLE} />
              <Row label="Grip input" value={c.grip !== null ? c.grip.toFixed(2) : NOT_AVAILABLE} />
              <Row label="Trigger input" value={c.trigger !== null ? c.trigger.toFixed(2) : NOT_AVAILABLE} />
            </dl>
            <div className="vr-controller-footer mt-4 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <SideBadge side={c.side} />
                <span className="text-sm text-ink2">
                  maps to {c.side} arm pair ·{' '}
                  <span className={pairs[c.side].ready ? 'text-ok' : 'text-warn'}>
                    {pairs[c.side].ready ? 'pair ready' : 'pair not ready'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
          </div>
        </Card>
      </div>

      <Section title="Robot mapping" description={implementation === 'vr_lekiwi' ? 'The tested operator surface preserves left/right controller isolation.' : 'Existing VR Control remains available for rollback.'}>
        <Card className="vr-mapping-card">
          <div className="vr-mapping-toolbar border-b border-line p-5">
            <p className="mb-3 text-sm font-medium text-ink">Follower to test</p>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((side) => <Button key={side} variant={selectedSide === side ? 'primary' : 'secondary'} onClick={() => setSelectedSide(side)}>{side === 'left' ? 'Left follower' : 'Right follower'}</Button>)}
            </div>
            <p className="mt-3 text-sm text-ink2">The leader arm is not used in VR mode. Only the selected follower will connect.</p>
          </div>
          <div className="vr-mapping-grid grid gap-5 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="vr-technical-bay rounded-xl border border-line bg-elev/60 p-5">
              <div className="vr-bay-crosshair" aria-hidden="true" />
              <p className="eyebrow-label">VR technical bay</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-ink">Controller to follower mapping</p>
              <p className="mt-2 max-w-sm text-sm text-ink2">Review the active controller pose, scaling and safety boundary before sending a VR command.</p>
              <dl className="mt-6 space-y-3 text-sm">
                <Row label="Active implementation" value={implementation === 'vr_lekiwi' ? 'VR LeKiwi' : 'VR Control'} />
                <Row label="Selected follower" value={`${selectedSide} arm`} />
                <Row label="Arm mode" value={armMode} />
                <Row label="Response profile" value={responseProfile} />
              </dl>
            </div>
            {(['left', 'right'] as const).map((side) =>
            <div key={side} className="vr-mapping-side rounded-xl border border-line bg-elev/60 p-4">
                <div className="flex items-center gap-2">
                  <SideBadge side={side} />
                  <span className="text-sm text-ink2">
                    {side} controller → {side} robotic arm
                  </span>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Controller pose" value={supported ? 'x 0.21 · y 1.04 · z -0.33' : NOT_AVAILABLE} />
                  <Row label="Robot target pose" value={supported ? 'computed by backend IK' : NOT_AVAILABLE} />
                  <Row label="Gripper mapping" value="trigger → gripper 0–100%" />
                  <Row label="Movement scaling" value={`${scale}%`} />
                  <Row label="Safety boundary" value="0.6 m sphere around base" />
                </dl>
              </div>
            )}
          </div>
          <div className="border-t border-line p-5">
            <div className="max-w-md">
              <Slider label="Movement scaling" min={10} max={100} step={5} unit="%" value={scale} onChange={setScale} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-ink">Response profile</p>
              <div className="flex flex-wrap gap-2">
                {(['smooth', 'balanced', 'fast'] as const).map((profile) =>
                  <Button
                    key={profile}
                    size="sm"
                    variant={responseProfile === profile ? 'primary' : 'secondary'}
                    onClick={() => setResponseProfile(profile)}>
                    {profile === 'smooth' ? 'Smooth' : profile === 'balanced' ? 'Balanced' : 'Fast'}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-sm text-ink2">
                {responseProfile === 'smooth'
                  ? 'Lowest jerk for the first hardware test.'
                  : responseProfile === 'balanced'
                    ? 'Adaptive smoothing with moderate joint speed.'
                    : 'Fastest allowed response; use only after Balanced is stable.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
            <Button variant="primary" icon={HandIcon} disabled={!backendOnline || Boolean(backendTask?.running) || implementation !== 'vr_lekiwi'} onClick={() => startLeKiwiVR(armMode)}>
              Start VR LeKiwi
            </Button>
            <Button variant="secondary" icon={PlayIcon} disabled={!supported || !backendOnline || Boolean(backendTask?.running) || implementation !== 'vr_control'} onClick={() => startSession('vr', ['left', 'right'])}>
              Start VR Control
            </Button>
            <Button icon={SlidersHorizontalIcon} disabled={!supported}>
              Configure mapping
            </Button>
          </div>
        </Card>
      </Section>
      <details className="vr-settings rounded-xl border border-line bg-card">
        <summary className="cursor-pointer px-5 py-4 font-medium text-ink">More VR settings</summary>
        <div className="flex flex-wrap gap-2 border-t border-line p-5">
          <Button icon={CrosshairIcon} onClick={() => toast({ title: 'Workspace recentered', tone: 'success' })}>Recenter workspace</Button>
          <Button icon={HandIcon} disabled={!supported}>Enable hand tracking</Button>
          <Button icon={ShieldIcon}>Configure safety limits</Button>
        </div>
      </details>
      <Card><div className="vr-footer-note p-4 text-sm text-ink2">After VR LeKiwi is Ready, use the generated operator URL above in Quest Browser. The URL comes from the active relay; CHECKIK does not infer or hard-code its host or port.</div></Card>
    </div>);

}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-elev/60 p-3"><div className="text-xs uppercase tracking-wide text-faint">{label}</div><div className="mt-1 font-mono text-sm text-ink">{value}</div></div>;
}

function Row({
  label,
  value,
  icon: Icon




}: {label: string;value: string;icon?: React.ComponentType<{className?: string;}>;}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-ink2">
        {Icon ? <Icon className="h-3.5 w-3.5 text-faint" /> : null}
        {label}
      </dt>
      <dd className="font-mono text-ink capitalize">{value}</dd>
    </div>);

}
