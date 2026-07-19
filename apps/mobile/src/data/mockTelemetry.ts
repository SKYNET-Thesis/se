export const torqueSeries = [64, 56, 61, 48, 54, 52, 59, 51, 57, 62, 55, 58, 53, 49, 47, 50, 45, 43, 46, 48, 52, 55, 53, 57];

export const speedSeries = [22, 31, 28, 38, 35, 30, 41, 29, 33, 27, 36, 44, 39, 34, 46, 42, 37, 40, 43, 39, 35, 32, 37, 41];

export const joints = [
  { label: "Axis A Motor", temp: "78.118594°C", rpm: "1,568 rpm" },
  { label: "Axis B Motor", temp: "78.118594°C", rpm: "1,568 rpm" },
  { label: "Axis C Motor", temp: "78.118594°C", rpm: "1,568 rpm" }
];

export const matrix = [
  "ok", "ok", "ok", "idle", "ok", "ok", "ok", "ok",
  "warn", "ok", "warn", "ok", "ok", "idle", "ok", "ok",
  "ok", "ok", "err", "ok", "err", "ok", "ok", "idle",
  "ok", "idle", "err", "ok", "warn", "ok", "err", "ok"
];

export type RobotFault = {
  node: string;
  component: string;
  title: string;
  severity: "warning" | "error";
  summary: string;
  detail: string;
  value: string;
  detected: string;
};

export const robotFaults: RobotFault[] = [
  {
    node: "shoulder_lift",
    component: "Shoulder lift motor",
    title: "Shoulder temperature",
    severity: "warning",
    summary: "Temperature above the 75 C warning threshold",
    detail: "Motor temperature has remained above the warning threshold for 38 seconds. Reduce payload or pause motion before resuming the task.",
    value: "78.1 C",
    detected: "38 s ago"
  },
  {
    node: "elbow_flex",
    component: "Elbow flex joint",
    title: "Elbow torque variance",
    severity: "warning",
    summary: "Torque is fluctuating outside the target range",
    detail: "Measured torque differs from the planned trajectory by 18 percent. Inspect the joint for obstruction and verify payload calibration.",
    value: "+18%",
    detected: "1 m ago"
  },
  {
    node: "gripper_link",
    component: "End-effector gripper",
    title: "Gripper feedback lost",
    severity: "error",
    summary: "Position feedback has not updated",
    detail: "The gripper encoder stopped reporting position data. Automatic motion is inhibited until feedback communication is restored.",
    value: "Offline",
    detected: "2 m ago"
  }
];
