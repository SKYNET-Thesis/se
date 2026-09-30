import React, { useState } from 'react';
import { ShieldIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SimulatedBadge } from '../components/ui/Badge';
import { Select, TextInput, Toggle } from '../components/ui/Field';
import { EmergencyStopButton } from '../components/shell/EmergencyStopButton';
import { useLab } from '../contexts/LabContext';
import { cx } from '../lib/format';

export function Settings() {
  const { theme, toggleTheme, capabilities, telemetryMode, setTelemetryMode, estop, toast } = useLab();
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const [wsUrl, setWsUrl] = useState('ws://localhost:8000/ws/teleop');
  const [confirmMotion, setConfirmMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const flags = Object.entries(capabilities).filter(([, v]) => typeof v === 'boolean') as [string, boolean][];

  return (
    <div className="settings-page system-settings-page mx-auto max-w-[80rem] space-y-6">
      <PageHeader
        title="Settings"
        description="Backend endpoints, interface preferences and the safety state reported by the rig."
        meta={<SimulatedBadge />} />
      <div className="system-status-strip" aria-label="System summary">
        <div><span className="system-status-strip__label">Backend</span><strong>{capabilities.backendName}</strong><span className="status-live" /> online profile</div>
        <div><span className="system-status-strip__label">Motion path</span><strong>{capabilities.supportsTorqueControl ? 'Available' : 'Simulated'}</strong><span className={capabilities.supportsTorqueControl ? 'status-live' : 'status-connecting'} /></div>
        <div><span className="system-status-strip__label">E-stop</span><strong>{estop === 'ready' ? 'Ready' : 'Action required'}</strong><span className={estop === 'ready' ? 'status-live' : 'status-danger'} /></div>
      </div>

      <Card className="settings-card-backend">
        <CardHeader title="Backend" description={`${capabilities.backendName} ${capabilities.backendVersion}`} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextInput label="API base URL" mono value={apiUrl} onChange={setApiUrl} />
          <TextInput label="Teleoperation WebSocket" mono value={wsUrl} onChange={setWsUrl} />
        </div>
        <div className="border-t border-line px-5 py-3.5">
          <Button onClick={() => toast({ title: 'Backend reachable', detail: `${apiUrl} · 13 ms`, tone: 'success' })}>
            Test connection
          </Button>
        </div>
      </Card>

      <Card className="settings-card-capabilities">
        <CardHeader title="Backend capabilities" description="Reported by the connected backend — unsupported features stay disabled in the interface" />
        <ul className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {flags.map(([name, enabled]) =>
          <li
            key={name}
            className={cx(
              'flex items-center gap-2 rounded-lg border px-3 py-2',
              enabled ? 'border-ok/30 bg-ok/[0.06]' : 'border-line bg-subtle'
            )}>
            
              <span className={cx('h-1.5 w-1.5 rounded-full', enabled ? 'bg-ok' : 'bg-faint')} aria-hidden />
              <span className="font-mono text-xs text-ink truncate">{name}</span>
              <span className={cx('ml-auto text-xs', enabled ? 'text-ok' : 'text-faint')}>
                {enabled ? 'supported' : 'unsupported'}
              </span>
            </li>
          )}
        </ul>
      </Card>

      <Card className="settings-card-safety" accent={estop === 'ready' ? undefined : 'brand'}>
        <CardHeader
          title="Safety"
          icon={ShieldIcon}
          actions={
          <Badge tone={estop === 'ready' ? 'ok' : 'danger'}>
              {estop === 'ready' ? 'E-STOP READY' : estop === 'active' ? 'E-STOP ACTIVE' : 'RESET REQUIRED'}
            </Badge>
          } />
        
        <div className="space-y-2 p-5">
          <Toggle
            label="Confirm before enabling motion"
            description="Require a second click before torque is engaged or a session starts."
            checked={confirmMotion}
            onChange={setConfirmMotion} />
          
          <p className="text-sm text-faint">
            The emergency stop in this interface asks the backend to release torque and end the session. It is not a
            substitute for a physical emergency stop wired to the rig's power supply.
          </p>
          <div className="pt-2">
            <EmergencyStopButton />
          </div>
        </div>
      </Card>

      <Card className="settings-card-interface">
        <CardHeader title="Interface" />
        <div className="space-y-3 p-5">
          <Toggle
            label="Light theme"
            description="Switches the whole console to the light palette."
            checked={theme === 'light'}
            onChange={toggleTheme} />
          
          <Toggle
            label="Reduce interface motion"
            description="Minimises transitions during teleoperation sessions."
            checked={reducedMotion}
            onChange={setReducedMotion} />
          
          <div className="max-w-xs">
            <Select
              label="Default joint telemetry view"
              value={telemetryMode}
              onChange={(v) => setTelemetryMode(v as 'compact' | 'detailed')}
              options={[
              { value: 'compact', label: 'Compact' },
              { value: 'detailed', label: 'Detailed (all six joints)' }]
              } />
            
          </div>
        </div>
      </Card>
    </div>);

}
