import { useEffect, useState } from "react";
import {
  CALIBRATION_JOINTS,
  CalibrationJointState,
  CalibrationPhase,
  startCalibrationTelemetry
} from "../data/calibrationTelemetry";

type Stream = { armId: string; phase: CalibrationPhase; joints: CalibrationJointState[] };

// Live joint states of ONE arm for the calibration monitor. Streams only
// while both `armId` and `phase` are set (the screen passes null when it is
// not on a guided step, not focused, or the arm is offline) and stops on
// change or unmount.
//
// Samples are tagged with the arm and phase they were started for, and
// only returned while those still match — after switching arms the monitor
// shows nothing until the new arm reports, never the previous arm's values.
// A sample may cover only some joints; a joint keeps its last value until
// it is reported again, and appears once it has been reported at all.
//
// Observed min / max are tracked for the range step only, and restart from
// the first sample each time that step begins — they describe what was seen
// during this attempt, never a stored or "passed" calibration.
export function useCalibrationTelemetry(
  armId: string | null,
  phase: CalibrationPhase | null
): CalibrationJointState[] | null {
  const [stream, setStream] = useState<Stream | null>(null);

  useEffect(() => {
    if (!armId || !phase) {
      setStream(null);
      return undefined;
    }
    const trackRange = phase === "range";
    let first = true;
    return startCalibrationTelemetry(armId, phase, (samples) => {
      const restart = first;
      first = false;
      const reported = new Map(samples.map((sample) => [sample.jointId, sample.position]));
      setStream((previous) => {
        const before = !restart && previous?.armId === armId && previous.phase === phase ? previous.joints : [];
        const joints = CALIBRATION_JOINTS.flatMap((joint) => {
          const prior = before.find((state) => state.id === joint.id);
          const current = reported.get(joint.id) ?? prior?.current;
          if (current === undefined) return [];
          return [
            {
              id: joint.id,
              label: joint.label,
              current,
              minObserved: trackRange ? Math.min(prior?.minObserved ?? current, current) : null,
              maxObserved: trackRange ? Math.max(prior?.maxObserved ?? current, current) : null
            }
          ];
        });
        return { armId, phase, joints };
      });
    });
  }, [armId, phase]);

  return stream && stream.armId === armId && stream.phase === phase && stream.joints.length > 0 ? stream.joints : null;
}
