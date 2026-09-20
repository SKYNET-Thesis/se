import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, CrosshairIcon, LoaderCircleIcon, PlusIcon, SaveIcon, Settings2Icon, UsbIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select, TextInput } from '../components/ui/Field';
import { BackendTaskPanel } from '../components/system/BackendTaskPanel';
import { CalibrationWizard } from '../components/system/CalibrationWizard';
import { Modal } from '../components/ui/Modal';
import { useLab } from '../contexts/LabContext';
import type { ArmSide, RobotDevice } from '../types';

const steps = ['Workspace', 'Connect devices', 'Calibrate', 'Test setup'];

export function WorkspacePorts() {
  const { workspace, updateWorkspace, saveWorkspace, createWorkspace, devices, ports, scanPorts, scanning, assignPort,
    calibrateDevice, backendOnline, backendTask, toast } = useLab();
  const [step, setStep] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [configureId, setConfigureId] = useState<string | null>(null);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [findPhase, setFindPhase] = useState<'unplug' | 'reconnect'>('unplug');
  const [detectedPort, setDetectedPort] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMode, setNewMode] = useState<'single' | 'dual'>('dual');
  const [setupSide, setSetupSide] = useState<ArmSide | 'both'>(() => workspace.preferredMode === 'single' ? 'left' : 'both');
  const portsBeforeFind = useRef<string[]>([]);
  const assigningPort = useRef(false);

  const singleSide: ArmSide = setupSide === 'right' ? 'right' : 'left';
  const requiredDevices = workspace.preferredMode === 'single' ? devices.filter((device) => device.side === singleSide) : devices;
  const visibleDevices = workspace.preferredMode === 'dual' && setupSide !== 'both'
    ? requiredDevices.filter((device) => device.side === setupSide)
    : requiredDevices;
  const orderedDevices = useMemo(() => [...visibleDevices].sort((a, b) => ['left-leader', 'left-follower', 'right-leader', 'right-follower'].indexOf(a.id) - ['left-leader', 'left-follower', 'right-leader', 'right-follower'].indexOf(b.id)), [visibleDevices]);
  const assigned = requiredDevices.filter((device) => device.serialPort).length;
  const calibrated = requiredDevices.filter((device) => device.calibration === 'calibrated').length;
  const allAssigned = assigned === requiredDevices.length;
  const allCalibrated = calibrated === requiredDevices.length;
  const configured = devices.find((device) => device.id === configureId) ?? null;
  const finding = devices.find((device) => device.id === findingId) ?? null;

  useEffect(() => {
    if (!findingId) return;
    const present = new Set(ports.filter((port) => port.present).map((port) => port.path));
    if (findPhase === 'unplug') {
      const removed = portsBeforeFind.current.filter((path) => !present.has(path));
      if (removed.length !== 1 || assigningPort.current) return;
      assigningPort.current = true;
      const candidate = removed[0];
      void assignPort(findingId, candidate, true).then((ok) => {
        assigningPort.current = false;
        if (!ok) return;
        setDetectedPort(candidate);
        setFindPhase('reconnect');
      });
    } else if (detectedPort && present.has(detectedPort)) {
      toast({ title: 'Port assigned', detail: `${finding?.name} → ${detectedPort}`, tone: 'success' });
      setFindingId(null); setDetectedPort(null); setFindPhase('unplug');
    }
  }, [assignPort, detectedPort, findPhase, finding?.name, findingId, ports, toast]);

  const beginFind = (device: RobotDevice) => {
    portsBeforeFind.current = ports.filter((port) => port.present).map((port) => port.path);
    if (!portsBeforeFind.current.length) { toast({ title: 'No serial board detected', detail: 'Connect the USB board and scan again.', tone: 'warning' }); return; }
    assigningPort.current = false;
    setConfigureId(null);
    setFindingId(device.id); setFindPhase('unplug'); setDetectedPort(null);
  };
  const optionsFor = (device: RobotDevice) => [{ value: '', label: 'Not assigned' }, ...ports.map((port) => ({ value: port.path, label: `${port.path}${port.present ? '' : ' · missing'}`, disabled: Boolean(port.assignedTo && port.assignedTo !== device.id) }))];
  const checkSetup = () => {
    const next: string[] = [];
    requiredDevices.forEach((device) => {
      if (!device.serialPort) next.push(`${device.name}: no port assigned`);
      else if (!ports.some((port) => port.path === device.serialPort && port.present)) next.push(`${device.name}: ${device.serialPort} is missing`);
      if (device.calibration !== 'calibrated') next.push(`${device.name}: calibration required`);
    });
    setIssues(next);
  };
  const canContinue = step === 0 ? Boolean(workspace.name.trim()) : step === 1 ? allAssigned : step === 2 ? allCalibrated : true;
  const sideOptions = workspace.preferredMode === 'dual'
    ? ([['both', 'Both arms'], ['left', 'Left arm'], ['right', 'Right arm']] as const)
    : ([['left', 'Left arm'], ['right', 'Right arm']] as const);
  const sidePicker = <div className="flex flex-wrap items-center gap-2">
    <span className="mr-1 text-sm text-faint">Configure side</span>
    {sideOptions.map(([value, label]) => <button
      key={value}
      type="button"
      onClick={() => { setSetupSide(value); setConfigureId(null); }}
      aria-pressed={setupSide === value}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${setupSide === value ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-elev text-ink2 hover:text-ink'}`}
    >{label}</button>)}
  </div>;

  return <div className="setup-page mx-auto max-w-[82rem] space-y-5 pb-24">
    <PageHeader title="Robot setup" description="Prepare the SO-101 rig in four clear steps." meta={<Badge tone={backendOnline ? 'ok' : 'danger'}>{backendOnline ? 'Backend online' : 'Backend offline'}</Badge>} actions={<Button icon={PlusIcon} onClick={() => setCreateOpen(true)}>New workspace</Button>} />

    <Card className="setup-stepper"><div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">{steps.map((label, index) => <button key={label} type="button" onClick={() => setStep(index)} aria-current={index === step ? 'step' : undefined} data-complete={index < step ? 'true' : 'false'} className={`rounded-lg border px-4 py-3 text-left transition-colors ${index === step ? 'border-brand bg-brand/10 text-ink' : index < step ? 'border-ok/30 bg-ok/5 text-ok' : 'border-line text-faint'}`}>
      <span className="mr-2 font-mono text-xs">{index < step ? '✓' : index + 1}</span><span className="text-sm font-medium">{label}</span>
    </button>)}</div></Card>

    {step === 0 ? <Card><CardHeader title="Workspace" description="Name the workspace and choose how many SO-101 boards it contains." />
      <div className="grid gap-4 p-5 lg:grid-cols-2"><TextInput label="Workspace name" value={workspace.name} onChange={(name) => updateWorkspace({ name })} /><TextInput label="Description" value={workspace.description} onChange={(description) => updateWorkspace({ description })} />
        <Select label="Rig mode" value={workspace.preferredMode === 'single' ? 'single' : 'dual'} onChange={(value) => { updateWorkspace({ preferredMode: value as 'single' | 'dual' }); setSetupSide(value === 'dual' ? 'both' : 'left'); }} options={[{ value: 'single', label: 'Single arm · 1 leader + 1 follower' }, { value: 'dual', label: 'Bimanual · 2 leaders + 2 followers' }]} />
        {sidePicker}</div>
    </Card> : null}

    {step === 1 ? <Card><CardHeader title="Connect devices" description="Each row stays compact. Open Configure only for the device you are working on." actions={<Badge tone={allAssigned ? 'ok' : 'neutral'}>{assigned}/{requiredDevices.length} assigned</Badge>} />
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4"><Button icon={UsbIcon} onClick={scanPorts} disabled={scanning || !backendOnline}>{scanning ? 'Scanning…' : 'Scan devices'}</Button>{sidePicker}</div>
      <div className="divide-y divide-line">{orderedDevices.map((device) => {
        const present = ports.some((port) => port.path === device.serialPort && port.present);
        return <div key={device.id} className="grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <div><p className="font-medium text-ink">{device.side === 'left' ? 'Left' : 'Right'} {device.role === 'leader' ? 'Leader' : 'Follower'}</p><p className="text-sm text-faint">{device.name}</p></div>
          <p className="font-mono text-sm text-ink2">{device.serialPort ?? 'Not assigned'}</p>
          <Badge tone={present ? 'ok' : device.serialPort ? 'danger' : 'neutral'}>{present ? 'Connected' : device.serialPort ? 'Missing' : 'Not configured'}</Badge>
          <Button icon={Settings2Icon} onClick={() => setConfigureId(device.id)}>Configure</Button>
        </div>;
      })}</div>
    </Card> : null}

    {step === 2 ? <><Card><CardHeader title="Calibration" description="Calibrate one selected arm at a time. Put it in the middle position before starting." actions={<Badge tone={allCalibrated ? 'ok' : 'warn'}>{calibrated}/{requiredDevices.length} saved</Badge>} />
      <div className="border-b border-line p-4">{sidePicker}</div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">{orderedDevices.map((device) => <div key={device.id} className="flex items-center justify-between rounded-xl border border-line p-4"><div><p className="font-medium text-ink">{device.name}</p><p className="mt-1 text-sm text-faint">{device.calibrationProfile?.name ?? 'No calibration profile'}</p></div><Button variant={device.calibration === 'calibrated' ? 'secondary' : 'primary'} disabled={!device.serialPort || Boolean(backendTask?.running)} onClick={() => calibrateDevice(device.id)}>{device.calibration === 'calibrated' ? 'Recalibrate' : 'Calibrate'}</Button></div>)}</div>
    </Card><CalibrationWizard /></> : null}

    {step === 3 ? <Card><CardHeader title="Test setup" description="Run one final non-motion readiness check before opening teleoperation." />
      <div className="p-5"><div className="flex items-center justify-between rounded-xl border border-line bg-elev p-5"><div><p className="font-medium text-ink">{allAssigned && allCalibrated ? 'Rig configuration complete' : 'Setup still needs attention'}</p><p className="mt-1 text-sm text-faint">Checks ports, presence and calibration profiles. It does not move the robot.</p></div><Button variant="primary" icon={CheckCircle2Icon} onClick={checkSetup}>Check setup</Button></div>
        {issues ? <div className={`mt-4 rounded-xl border p-4 ${issues.length ? 'border-warn/40 text-warn' : 'border-ok/40 text-ok'}`}>{issues.length ? issues.map((issue) => <p key={issue}>• {issue}</p>) : 'All devices are ready. You can save and continue to Control.'}</div> : null}</div>
    </Card> : null}

    <details className="technical-console rounded-xl border"><summary className="cursor-pointer px-5 py-4 font-medium text-ink">Technical details & task console</summary><BackendTaskPanel /></details>

    <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-line bg-bg/95 px-5 py-3 backdrop-blur lg:left-64 xl:left-[17.5rem]">
      <Button icon={ChevronLeftIcon} disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</Button>
      <span className="text-sm text-faint">Step {step + 1} of {steps.length}</span>
      {step < 3 ? <Button variant="primary" icon={ChevronRightIcon} disabled={!canContinue} onClick={() => setStep((value) => Math.min(3, value + 1))}>Continue</Button> : <Button variant="primary" icon={SaveIcon} disabled={!allAssigned || !allCalibrated} onClick={saveWorkspace}>Save workspace</Button>}
    </div>

    {configured ? <div className="fixed inset-0 z-40 bg-black/55" onClick={() => setConfigureId(null)}><aside className="absolute bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto border-l border-line bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between border-b border-line p-5"><div><p className="text-lg font-semibold text-ink">Configure {configured.name}</p><p className="mt-1 text-sm text-faint">Port, profile and device actions</p></div><button onClick={() => setConfigureId(null)} className="rounded-lg p-2 hover:bg-subtle"><XIcon className="h-4 w-4" /></button></div>
      <div className="space-y-5 p-5"><Select label="Serial port" mono value={configured.serialPort ?? ''} onChange={(value) => assignPort(configured.id, value || null)} options={optionsFor(configured)} />
        <div><p className="mb-2 text-sm text-ink2">Calibration profile</p><div className="rounded-lg border border-line bg-elev p-3 font-mono text-sm text-ink">{configured.calibrationProfile?.name ?? 'No profile saved'}</div></div>
        <div className="space-y-2 border-t border-line pt-5"><Button className="w-full" icon={CrosshairIcon} onClick={() => beginFind(configured)}>Find port</Button><Button className="w-full" variant="primary" disabled={!configured.serialPort} onClick={() => { calibrateDevice(configured.id); setConfigureId(null); setStep(2); }}>Calibrate this device</Button></div>
        <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium">More actions</summary><p className="mt-3 text-sm text-faint">Movement testing stays disabled until calibration and safety checks pass.</p></details>
      </div>
    </aside></div> : null}

    <Modal open={Boolean(findingId)} onClose={() => setFindingId(null)} title="Find port" description={`Detect the USB port for ${finding?.name ?? 'this device'}.`}><div className="p-6 text-center">
      {findPhase === 'unplug' ? <LoaderCircleIcon className="mx-auto h-12 w-12 animate-spin text-brand" /> : <CheckCircle2Icon className="mx-auto h-12 w-12 text-ok" />}
      <h3 className="mt-5 text-xl font-semibold">{findPhase === 'unplug' ? `Unplug ${finding?.name}` : `Assigned ${detectedPort}`}</h3><p className="mx-auto mt-2 max-w-md text-sm text-ink2">{findPhase === 'unplug' ? 'Unplug exactly one USB cable. Detection and assignment happen automatically; do not press Enter.' : `Reconnect ${detectedPort}. This dialog closes automatically.`}</p>
    </div></Modal>

    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create workspace" description="Choose the rig before connecting devices."><form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); createWorkspace({ name: newName, description: newDescription, mode: newMode }); setCreateOpen(false); setStep(1); }}><TextInput label="Workspace name" value={newName} onChange={setNewName} /><TextInput label="Description" value={newDescription} onChange={setNewDescription} /><Select label="Rig mode" value={newMode} onChange={(value) => setNewMode(value as 'single' | 'dual')} options={[{ value: 'single', label: 'Single arm · 2 boards' }, { value: 'dual', label: 'Bimanual · 4 boards' }]} /><div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" variant="primary" icon={PlusIcon} disabled={!newName.trim()}>Create</Button></div></form></Modal>
  </div>;
}
