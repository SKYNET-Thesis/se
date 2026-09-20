import { AlertTriangleIcon, CheckCircle2Icon, Rotate3DIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLab } from '../../contexts/LabContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

const labels: Record<string, string> = {
  shoulder_pan: 'Shoulder pan',
  shoulder_lift: 'Shoulder lift',
  elbow_flex: 'Elbow flex',
  wrist_flex: 'Wrist flex',
  wrist_roll: 'Wrist roll',
  gripper: 'Gripper',
};

export function CalibrationWizard() {
  const navigate = useNavigate();
  const { backendTask, sendTaskInput } = useLab();
  const calibration = backendTask?.calibration;
  if (!calibration) return null;

  const step = calibration.stage;
  // wrist_roll is intentionally fixed to its full encoder span by LeRobot,
  // so it already counts as captured even though it isn't streamed.
  const measured = calibration.joints.filter((joint) =>
    joint.status === 'observed' || joint.status === 'done' || joint.status === 'automatic'
  ).length;
  return <Card className={calibration.arm === 'left' ? 'border-armleft/40' : 'border-armright/40'}>
    <CardHeader title={`Calibration wizard · ${calibration.arm.toUpperCase()} ${calibration.target}`}
      description="Only the selected SO-101 board is being calibrated."
      icon={Rotate3DIcon}
      actions={<Badge tone={step === 'complete' ? 'ok' : 'warn'}>{step === 'complete' ? 'Complete' : step}</Badge>} />

    <div className="border-t border-line p-5">
      <div className="mb-5 grid grid-cols-4 gap-2 text-xs">
        {['Profile', 'Middle', 'Joint ranges', 'Save'].map((label, index) => {
          const current = { profile: 0, middle: 1, range: 2, saving: 3, complete: 4 }[step];
          return <div key={label} className={`rounded-lg border px-3 py-2 ${index < current ? 'border-ok/30 bg-ok/10 text-ok' : index === current ? 'border-brand/50 bg-brand/10 text-brand' : 'border-line text-faint'}`}>
            {index < current ? '✓ ' : ''}{label}
          </div>;
        })}
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-warn/35 bg-warn/10 p-4">
        <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div><p className="font-semibold text-ink">{step === 'middle' ? 'Move the robot to the middle position before calibration' : 'Current instruction'}</p>
          <p className="mt-1 text-sm text-ink2">{calibration.instruction}</p>
          {step === 'middle' ? <p className="mt-2 text-xs text-warn">Do not place every joint at a mechanical end-stop. Center shoulder, elbow, wrist and gripper first.</p> : null}
        </div>
      </div>

      {step === 'range' || step === 'saving' || step === 'complete' ? <>
        <div className="mb-2 flex items-center justify-between"><p className="font-medium text-ink">Servo range capture</p>
          <p className="text-sm text-faint">{measured}/6 completed</p></div>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-[1.3fr_.7fr_2fr_.7fr_1fr] bg-subtle/50 px-4 py-2 text-xs uppercase tracking-wide text-faint">
            <span>Servo</span><span>Min</span><span>Observed range / position</span><span>Max</span><span>Status</span>
          </div>
          {calibration.joints.map((joint) => {
            const hasRange = joint.min !== null && joint.max !== null && joint.max > joint.min;
            const rawPct = (value: number | null) => value === null ? 0 : Math.max(0, Math.min(100, value / 4095 * 100));
            const minPct = rawPct(joint.min);
            const maxPct = rawPct(joint.max);
            const positionPct = rawPct(joint.position);
            const completed = joint.status === 'observed' || joint.status === 'automatic' || joint.status === 'done';
            const achieved = hasRange ? joint.max! - joint.min! : 0;
            const target = joint.targetRange ?? 0;
            return <div key={joint.name} className="grid grid-cols-[1.3fr_.7fr_2fr_.7fr_1fr] items-center border-t border-line px-4 py-3 text-sm">
            <span className="font-medium text-ink">{labels[joint.name] ?? joint.name}</span>
            <span className="font-mono text-ink2">{joint.min ?? '—'}</span>
            <span className="pr-4"><span className="relative block h-2 overflow-visible rounded-full bg-subtle">
              <span className={`absolute inset-y-0 rounded-full transition-[left,width,background-color] duration-150 ease-linear ${completed ? 'bg-ok' : 'bg-brand'}`}
                style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }} />
              <span className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded bg-white shadow transition-[left] duration-100 ease-linear"
                style={{ left: `calc(${positionPct}% - 3px)` }} />
            </span><span className="mt-1 flex justify-between font-mono text-[11px] text-faint"><span>current {joint.position ?? '—'}</span><span>{target ? `${Math.min(100, Math.round(achieved / target * 100))}% range` : ''}</span></span></span>
            <span className="font-mono text-ink2">{joint.max ?? '—'}</span>
            <Badge tone={completed ? 'ok' : 'neutral'}>
              {joint.status === 'automatic' ? '✓ 0–4095 auto' : completed ? '✓ Complete' : 'waiting'}
            </Badge>
          </div>})}
        </div>
        <p className="mt-3 text-xs text-faint">A green check appears only after the measured encoder span reaches the validated SO-101 target. Move every joint carefully from one physical end to the other.</p>
      </> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {step === 'profile' ? <><Button variant="primary" onClick={() => sendTaskInput('')}>Use saved profile</Button>
          <Button onClick={() => sendTaskInput('c')}>Recalibrate from scratch</Button></> : null}
        {step === 'middle' ? <Button variant="primary" onClick={() => sendTaskInput('')}>Robot is centered · Continue</Button> : null}
        {step === 'range' && measured === 6 ? <Button variant="primary" onClick={() => sendTaskInput('')}>Finish this arm and save</Button> : null}
        {step === 'complete' ? <><span className="inline-flex items-center gap-2 text-sm text-ok"><CheckCircle2Icon className="h-5 w-5" /> Selected arm saved successfully.</span>
          <Button variant="primary" onClick={() => navigate('/dual-arm')}>Go to Leader Teleop</Button>
          <Button onClick={() => navigate('/vr')}>Prepare VR Teleop</Button></> : null}
      </div>
    </div>
  </Card>;
}
