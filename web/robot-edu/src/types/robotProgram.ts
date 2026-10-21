export type ArmId = 'left' | 'right';
export type JointName = 'base' | 'shoulder' | 'elbow' | 'wrist';
export type ZoneId = 'A' | 'B' | 'C';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Joints {
  base: number;
  shoulder: number;
  elbow: number;
  wrist: number;
}

export type Condition =
{kind: 'gripper_holding';arm: ArmId;} |
{kind: 'zone_occupied';zone: ZoneId;};

interface CommandBase {
  /** Blockly block id that produced this command — used for highlighting and error navigation. */
  blockId: string;
}

export type RobotCommand =
(CommandBase & {op: 'arm_select';arm: ArmId;}) |
(CommandBase & {op: 'move_to';arm: ArmId;target: Point3;speed: number;}) |
(CommandBase & {op: 'move_joint';arm: ArmId;joint: JointName;angle: number;}) |
(CommandBase & {op: 'move_home';arms: ArmId[];}) |
(CommandBase & {op: 'gripper';arm: ArmId;action: 'open' | 'close';}) |
(CommandBase & {op: 'wait';seconds: number;}) |
(CommandBase & {op: 'repeat';times: number;body: RobotCommand[];}) |
(CommandBase & {op: 'if';condition: Condition;then: RobotCommand[];else: RobotCommand[];}) |
(CommandBase & {op: 'move_both';left: Point3;right: Point3;speed: number;}) |
(CommandBase & {op: 'sync';});

export type RobotOp = RobotCommand['op'];

/** Structured, hardware-agnostic program produced from the Blockly workspace. */
export interface RobotProgram {
  schema: 'vista.robot-program';
  schemaVersion: '1.0';
  programId: string;
  name: string;
  generatedAt: string;
  units: {length: 'mm';angle: 'deg';time: 's';speed: 'percent';};
  arms: ArmId[];
  commands: RobotCommand[];
}

export type ProblemSeverity = 'error' | 'warning';

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  message: string;
  hint?: string;
  blockId: string | null;
}

export interface GenerationResult {
  program: RobotProgram;
  problems: Problem[];
}

export type LogLevel = 'info' | 'step' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  t: number;
  level: LogLevel;
  message: string;
  blockId?: string;
}

export interface SimArm {
  joints: Joints;
  tool: Point3;
  elbow: {x: number;y: number;};
  gripper: 'open' | 'closed';
  holding: string | null;
  busy: boolean;
}

export interface SimObject {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  heldBy: ArmId | null;
}

export interface SimState {
  arms: Record<ArmId, SimArm>;
  objects: SimObject[];
}

export interface ProgramRecord {
  id: string;
  name: string;
  assignmentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Blockly JSON serialization (Blockly.serialization.workspaces.save). */
  workspace: Record<string, unknown>;
}
