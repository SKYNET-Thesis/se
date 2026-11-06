import { SO101_NAMES } from './so101Model';
import type { JointState } from './twinTelemetry';

export function CalibrationPanel({
  frame,
  robotId,
  onOpenHardwareCalib,
}: {
  frame: JointState | null;
  robotId?: string;
  onOpenHardwareCalib?: () => void;
}) {
  const measured = new Map(frame?.measured.map((value) => [value.name, value]) ?? []);
  const verified = frame?.source_mode === 'LIVE_PHYSICAL' && frame.calibration_status === 'VERIFIED';

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-5" aria-labelledby="calibration-heading">
      <h2 id="calibration-heading" className="text-[15px] font-semibold text-ink">
        Calibration
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Visual calibration is local and operator-controlled. This panel never opens a serial device or sends a motor command.
      </p>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-ink-muted">VISTA robot</dt>
          <dd className="font-medium text-ink">{robotId ?? 'Select a robot'}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-ink-muted">Visual status</dt>
          <dd className="font-medium text-ink">
            {verified ? 'VERIFIED — calibrated pose enabled' : 'UNCALIBRATED — pose frozen'}
          </dd>
        </div>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Read-only physical mapping
      </h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-2">Measured</th>
              <th>URDF joint</th>
              <th>Raw value</th>
            </tr>
          </thead>
          <tbody>
            {SO101_NAMES.map((name) => (
              <tr key={name} className="border-t border-line">
                <td className="py-2">{name}</td>
                <td>
                  {
                    (
                      {
                        shoulder_pan: 'Rotation',
                        shoulder_lift: 'Pitch',
                        elbow_flex: 'Elbow',
                        wrist_flex: 'Wrist_Pitch',
                        wrist_roll: 'Wrist_Roll',
                        gripper: 'Jaw',
                      } as Record<string, string>
                    )[name]
                  }
                </td>
                <td className="font-mono">
                  {measured.get(name) ? `${measured.get(name)!.position} ${measured.get(name)!.unit}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-blue-50 p-3 text-xs text-blue-950">
        <p className="max-w-xl">
          Hardware calibration remains in the existing supervised LeLab workflow. Create, evidence, verify, and activate visual profiles with the local operator CLI before physical animation is enabled.
        </p>
        {onOpenHardwareCalib && (
          <button
            type="button"
            onClick={onOpenHardwareCalib}
            className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 transition-colors shrink-0"
          >
            Open Hardware Calibration &rarr;
          </button>
        )}
      </div>
    </section>
  );
}
