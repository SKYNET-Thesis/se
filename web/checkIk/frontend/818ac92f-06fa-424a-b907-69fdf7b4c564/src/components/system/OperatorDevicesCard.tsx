import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryMediumIcon, GlassesIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

const iconFor = (id: string) =>
id === 'quest3' ? GlassesIcon : id === 'ipad' ? TabletIcon : SmartphoneIcon;

export function OperatorDevicesCard() {
  const { operatorDevices, pairOperatorDevice, capabilities } = useLab();
  const navigate = useNavigate();

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Operator devices"
        description="Headsets and companion devices paired to this workspace"
        icon={GlassesIcon} />
      
      <ul className="divide-y divide-line/70 px-5">
        {operatorDevices.map((d) => {
          const Icon = iconFor(d.id);
          return (
            <li key={d.id} className="flex items-start gap-3 py-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle text-ink2">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base text-ink">{d.name}</p>
                <p className="text-sm text-ink2">{d.role}</p>
                <p className="font-mono text-xs text-faint">{d.detail}</p>
              </div>
              <div className="shrink-0 text-right space-y-1">
                {d.connected ? <Badge tone="ok">Connected</Badge> : <Badge tone="neutral">Disconnected</Badge>}
                {d.batteryPct !== null ?
                <p className="flex items-center justify-end gap-1 font-mono text-xs text-ink2">
                    <BatteryMediumIcon className="h-3.5 w-3.5" />
                    {d.batteryPct}%
                  </p> :

                <p className="text-xs text-faint">Battery not available</p>
                }
              </div>
            </li>);

        })}
      </ul>
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
        <Button size="sm" onClick={() => navigate('/vr')}>
          Open VR Control
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!capabilities.supportsMobilePairing}
          onClick={() => pairOperatorDevice('pixel')}>
          
          Pair device
        </Button>
      </div>
    </Card>);

}