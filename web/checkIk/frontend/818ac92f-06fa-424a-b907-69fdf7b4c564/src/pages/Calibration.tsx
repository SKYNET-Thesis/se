import React, { useState } from 'react';
import { CheckIcon, FolderOpenIcon, PlayIcon, RotateCcwIcon, SaveIcon, TargetIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, SideBadge, SimulatedBadge } from '../components/ui/Badge';
import { JointTelemetryList } from '../components/robotics/JointTelemetryList';
import { useLab } from '../contexts/LabContext';
import { useArmPairReadiness } from '../hooks/useLabDerived';
import { cx } from '../lib/format';
import type { ArmSide } from '../types';
import { BackendTaskPanel } from '../components/system/BackendTaskPanel';

const steps = [
{ id: 1, title: 'Select device', detail: 'Pick the arm to calibrate from the pair list.' },
{ id: 2, title: 'Confirm connection', detail: 'The backend opens the serial port and reads firmware.' },
{ id: 3, title: 'Move through ranges', detail: 'Sweep each joint slowly through its full travel.' },
{ id: 4, title: 'Validate joint limits', detail: 'Recorded minimum and maximum values are checked.' },
{ id: 5, title: 'Save profile', detail: 'The profile is written to the workspace and applied.' }];


export function Calibration() {
  const { devices, ports, calibrateDevice, toast, simulated } = useLab();
  const pairs = useArmPairReadiness();
  const [selectedId, setSelectedId] = useState(
    devices.find((d) => d.calibration !== 'calibrated')?.id ?? devices[0].id
  );
  const [step, setStep] = useState(1);
  const selected = devices.find((d) => d.id === selectedId)!;
  const offline = !selected.serialPort || !ports.some((port) => port.path === selected.serialPort && port.present);

  const advance = () => {
    if (step === 5) {
      calibrateDevice(selected.id);
      setStep(1);
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="calibration-page mx-auto max-w-[92rem] space-y-6">
      <PageHeader
        title="Calibration"
        description="Guided joint-range calibration for each SO-101 arm. Pair readiness updates as soon as a profile is saved."
        meta={simulated ? <SimulatedBadge /> : <Badge tone="ok">Local backend</Badge>} />
      

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          {(['left', 'right'] as ArmSide[]).map((side) =>
          <Card key={side} accent={side} className="calibration-pair-card">
              <CardHeader
              title={side === 'left' ? 'Left Pair' : 'Right Pair'}
              actions={<SideBadge side={side} />} />
            
              <ul className="p-2">
                {[pairs[side].leader, pairs[side].follower].map((d) =>
              <li key={d.id}>
                    <button
                  type="button"
                  onClick={() => {
                    setSelectedId(d.id);
                    setStep(1);
                  }}
                  aria-current={d.id === selectedId}
                  className={cx(
                    'w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-smooth',
                    d.id === selectedId ? 'bg-subtle' : 'hover:bg-subtle/70'
                  )}>
                  
                      <span className="flex items-center gap-2">
                        <span className="text-base text-ink">{d.name}</span>
                        {d.calibration === 'calibrated' ?
                    <Badge tone="ok" className="ml-auto">
                            Calibrated
                          </Badge> :

                    <Badge tone="warn" className="ml-auto">
                            Required
                          </Badge>
                    }
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-faint">
                        {d.serialPort ?? 'no port'} ·{' '}
                        {d.calibrationProfile?.name ?? 'no profile'}
                      </span>
                    </button>
                  </li>
              )}
              </ul>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader
            title={`Calibrate ${selected.name}`}
            description={`${selected.serialPort ?? 'No port assigned'} · SO-101 ${selected.role}`}
            icon={TargetIcon}
            actions={
            selected.calibration === 'calibrated' ?
            <Badge tone="ok">Profile saved</Badge> :

            <Badge tone="warn">Calibration required</Badge>

            } />
          

          {offline ?
          <div className="p-5">
              <p className="rounded-xl border border-danger/40 bg-danger/[0.07] p-4 text-base text-ink2">
                {selected.name} is offline. Connect the device on {selected.serialPort ?? 'an assigned port'} before
                starting calibration.
              </p>
            </div> :

          <>
              <ol className="divide-y divide-line/70 px-5">
                {steps.map((s) => {
                const state = s.id < step ? 'done' : s.id === step ? 'current' : 'todo';
                return (
                  <li key={s.id} className="flex items-start gap-3 py-3.5">
                      <span
                      className={cx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs',
                        state === 'done' ?
                        'border-ok/40 bg-ok/10 text-ok' :
                        state === 'current' ?
                        'border-brand/50 bg-brand/10 text-brand' :
                        'border-line bg-subtle text-faint'
                      )}>
                      
                        {state === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : s.id}
                      </span>
                      <div className="min-w-0">
                        <p className={cx('text-base', state === 'todo' ? 'text-ink2' : 'text-ink')}>{s.title}</p>
                        <p className="text-sm text-faint">{s.detail}</p>
                      </div>
                      {state === 'current' ?
                    <span className="ml-auto shrink-0">
                          <Badge tone="brand" withIcon={false}>
                            Current step
                          </Badge>
                        </span> :
                    null}
                    </li>);

              })}
              </ol>

              <div className="mx-5 mb-5 rounded-xl border border-line bg-elev/60 p-4">
                <p className="mb-3 text-sm font-medium text-ink2">Current joint values</p>
                <JointTelemetryList
                joints={selected.joints}
                accent={selected.side === 'left' ? '#35c9d0' : '#a78bfa'} />
              
              </div>

              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
                <Button variant="primary" icon={step === 5 ? SaveIcon : PlayIcon} onClick={advance}>
                  {step === 5 ? 'Save calibration profile' : step === 1 ? 'Start calibration' : 'Continue'}
                </Button>
                <Button
                icon={FolderOpenIcon}
                onClick={() => toast({ title: 'Profile loaded', detail: selected.name, tone: 'info' })}>
                
                  Load profile
                </Button>
                <Button icon={RotateCcwIcon} onClick={() => setStep(1)}>
                  Retry calibration
                </Button>
              </div>
            </>
          }
        </Card>
      </div>
      <BackendTaskPanel />
    </div>);

}
