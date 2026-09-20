import React from 'react';
import { GlassesIcon, KeyRoundIcon, SmartphoneIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { useLab } from '../contexts/LabContext';

export function Integrations() {
  const { capabilities, headset, operatorDevices, pairOperatorDevice, toast } = useLab();

  return (
    <div className="settings-page integrations-page mx-auto max-w-[80rem] space-y-6">
      <PageHeader
        title="Integrations"
        description="Optional services layered on top of the local rig. None of these are required for local teleoperation, recording or local training."
        meta={<SimulatedBadge />} />
      

      <Card>
        <CardHeader
          title="Hugging Face"
          icon={KeyRoundIcon}
          actions={<Badge tone="warn">Not authenticated</Badge>}
          description="Dataset and model sync with the Hub" />
        
        <div className="space-y-2 p-5 text-sm">
          <Row label="Account" value="Not connected" tone="warn" />
          <Row label="Dataset upload" value="Requires an access token" tone="warn" />
          <Row label="Model upload" value="Requires an access token" tone="warn" />
          <Row
            label="Cloud training"
            value={capabilities.supportsCloudTraining ? 'Available' : 'Not offered by this backend'}
            tone="muted" />
          
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
          <Button variant="primary" onClick={() => toast({ title: 'Paste a Hub access token to authenticate', tone: 'info' })}>
            Connect account
          </Button>
          <p className="text-sm text-faint">
            Authentication is only needed for Hub upload and download. Local training runs without a token.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="VR devices"
          icon={GlassesIcon}
          actions={<Badge tone={capabilities.supportsVRControl ? 'ok' : 'warn'}>{capabilities.supportsVRControl ? 'Bridge available' : 'Backend bridge missing'}</Badge>}
          description="Meta Quest headset and controllers" />
        
        <div className="space-y-2 p-5 text-sm">
          <Row label="Headset" value={`${headset.name} · ${headset.connected ? 'paired' : 'not paired'}`} tone={headset.connected ? 'ok' : 'muted'} />
          <Row
            label="Controllers"
            value={`${headset.controllers.filter((c) => c.connected).length} of 2 tracked`}
            tone="ok" />
          
          <Row label="Tracking" value={headset.trackingQuality ?? 'Not available'} tone="ok" />
          <Row
            label="Robot command path"
            value="Not implemented by leLab-extended 0.4.1"
            tone="warn" />
          
        </div>
        <div className="border-t border-line px-5 py-3.5">
          <p className="text-sm text-ink2">
            The headset is paired to this host for previewing the mapping UI. Controller-driven motion needs backend
            support before it can be enabled.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Mobile companion"
          icon={SmartphoneIcon}
          actions={<Badge tone={capabilities.supportsMobilePairing ? 'ok' : 'neutral'}>{capabilities.supportsMobilePairing ? 'Pairing supported' : 'Not supported'}</Badge>}
          description="Phones and tablets used for monitoring or as extra cameras" />
        
        <ul className="divide-y divide-line/70 px-5">
          {operatorDevices.
          filter((d) => d.id !== 'quest3').
          map((d) =>
          <li key={d.id} className="flex items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-base text-ink">{d.name}</p>
                  <p className="text-sm text-ink2">{d.role} · {d.detail}</p>
                </div>
                {d.connected ?
            <Badge tone="ok">Paired</Badge> :

            <Button size="sm" onClick={() => pairOperatorDevice(d.id)}>
                    Pair device
                  </Button>
            }
              </li>
          )}
        </ul>
        <div className="border-t border-line px-5 py-3.5">
          <p className="text-sm text-ink2">
            Companion devices can view robot status, monitor recording sessions and receive connection alerts. Using a
            phone as a recording camera is not yet exposed by this backend.
          </p>
        </div>
      </Card>
    </div>);

}

function Row({ label, value, tone }: {label: string;value: string;tone: 'ok' | 'warn' | 'muted';}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-faint';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink2">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>);

}
