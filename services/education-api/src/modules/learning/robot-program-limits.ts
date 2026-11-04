import { BadRequestException } from "@nestjs/common";

const DEFAULT_MAX_STEPS = 1000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

function configuredLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

/** Bound CPU work and JSON snapshots on both new and persisted programs. */
export function assertRobotProgramBounds(
  value: unknown,
  maxSteps = configuredLimit("ROBOT_PROGRAM_MAX_STEPS", DEFAULT_MAX_STEPS),
  maxBytes = configuredLimit("ROBOT_PROGRAM_MAX_BYTES", DEFAULT_MAX_BYTES),
): void {
  if (!value || typeof value !== "object" || !Array.isArray((value as { steps?: unknown }).steps)) return;
  if ((value as { steps: unknown[] }).steps.length > maxSteps) {
    throw new BadRequestException(`RobotProgram exceeds ${maxSteps} steps.`);
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
    throw new BadRequestException(`RobotProgram exceeds ${maxBytes} bytes.`);
  }
}
