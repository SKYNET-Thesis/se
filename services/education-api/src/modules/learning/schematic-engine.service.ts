import { BadRequestException, Injectable } from "@nestjs/common";

export interface SchematicObjectConfig {
  objectId: string;
  position: { x: number; y: number; z: number };
  graspRadius?: number;
  graspMaxZ?: number;
  liftMinZ?: number;
}

export interface SchematicZoneConfig {
  zoneId: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SchematicObjectState {
  objectId: string;
  position: { x: number; y: number; z: number };
  graspedBy: "left" | "right" | null;
  state: "free" | "grasped" | "carried" | "released";
}

export interface SchematicManipulationSummary {
  wasGrasped: boolean;
  wasLifted: boolean;
  wasReleased: boolean;
  graspAttempts: number;
  successfulGrasps: number;
  releasePosition: { x: number; y: number; z: number } | null;
  placedInZoneId: string | null;
  targetZoneDistance: number | null;
}

export interface SchematicRenderOptions {
  challengeObjects?: SchematicObjectConfig[];
  targetZones?: SchematicZoneConfig[];
}

export interface SchematicArtifact {
  schemaVersion: 1;
  engineVersion: "vista-schematic-1";
  robotProgramVersionId: string;
  timeline: Array<Record<string, unknown>>;
  finalState: {
    selectedArm: "left" | "right" | null;
    grippers: Record<"left" | "right", "open" | "closed">;
    learningPreviewPosition: { frame: "learning_preview_v1"; arm: "left" | "right"; x: number; y: number; z: number } | null;
    objectState?: SchematicObjectState;
    manipulation?: SchematicManipulationSummary;
    targetZones?: SchematicZoneConfig[];
  };
  warnings: string[];
}

/** Deterministic symbolic interpreter. It intentionally has no physics, IK,
 * collision, trajectory, reachability, wall-clock timing, or hardware output. */
@Injectable()
export class SchematicEngineService {
  render(robotProgram: unknown, robotProgramVersionId: string, options?: SchematicRenderOptions): SchematicArtifact {
    if (!robotProgram || typeof robotProgram !== "object") throw new BadRequestException("Program version has malformed RobotProgram IR.");
    const value = robotProgram as Record<string, unknown>;
    if (value.kind !== "robot_program" || value.schemaVersion !== 1 || !Array.isArray(value.steps)) throw new BadRequestException("Program version is not canonical RobotProgram IR version 1.");
    let selectedArm: "left" | "right" | null = null;
    let atMs = 0;
    const grippers: Record<"left" | "right", "open" | "closed"> = { left: "open", right: "open" };
    const armPositions: Record<"left" | "right", { x: number; y: number; z: number }> = {
      left: { x: 0, y: 0, z: 0 },
      right: { x: 0, y: 0, z: 0 },
    };
    let learningPreviewPosition: SchematicArtifact["finalState"]["learningPreviewPosition"] = null;

    const defaultObjConfig: SchematicObjectConfig = {
      objectId: "cube-red",
      position: { x: 120, y: 150, z: 0 },
      graspRadius: 30,
      graspMaxZ: 50,
      liftMinZ: 70,
    };
    const objCfg = options?.challengeObjects?.[0] ?? defaultObjConfig;
    const graspRadius = objCfg.graspRadius ?? 30;
    const graspMaxZ = objCfg.graspMaxZ ?? 50;
    const liftMinZ = objCfg.liftMinZ ?? 70;

    const defaultTargetZones: SchematicZoneConfig[] = [
      { zoneId: "A", label: "Bin A", x: 60, y: 280, w: 120, h: 90 },
    ];
    const targetZones = options?.targetZones?.length ? options.targetZones : defaultTargetZones;

    const objectState: SchematicObjectState = {
      objectId: objCfg.objectId,
      position: { ...objCfg.position },
      graspedBy: null,
      state: "free",
    };

    const manipulation: SchematicManipulationSummary = {
      wasGrasped: false,
      wasLifted: false,
      wasReleased: false,
      graspAttempts: 0,
      successfulGrasps: 0,
      releasePosition: null,
      placedInZoneId: null,
      targetZoneDistance: null,
    };

    const timeline: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];

    for (let index = 0; index < value.steps.length; index += 1) {
      const step = value.steps[index];
      if (!step || typeof step !== "object") throw new BadRequestException(`RobotProgram step ${index} is malformed.`);
      const typed = step as Record<string, unknown>;
      const type = typed.type;
      const event: Record<string, unknown> = { index, atMs, type };

      if (type === "arm.select") {
        if (typed.arm !== "left" && typed.arm !== "right") throw new BadRequestException("arm.select requires left or right arm.");
        selectedArm = typed.arm;
        event.selectedArm = selectedArm;
      } else if (type === "wait") {
        if (!Number.isInteger(typed.durationMs) || (typed.durationMs as number) < 0 || (typed.durationMs as number) > 60000) {
          throw new BadRequestException("wait requires durationMs between 0 and 60000.");
        }
        event.durationMs = typed.durationMs;
        atMs += typed.durationMs as number;
      } else if (type === "gripper.open" || type === "gripper.close") {
        if (!selectedArm) throw new BadRequestException(`${type} requires a preceding arm.select.`);
        grippers[selectedArm] = type === "gripper.open" ? "open" : "closed";
        event.arm = selectedArm;
        event.gripper = grippers[selectedArm];

        if (type === "gripper.close") {
          manipulation.graspAttempts += 1;
          const toolPos = armPositions[selectedArm];
          const dist = Math.hypot(toolPos.x - objectState.position.x, toolPos.y - objectState.position.y);
          const canGrasp = objectState.state !== "grasped" && objectState.state !== "carried" && dist <= graspRadius && toolPos.z <= graspMaxZ;

          if (canGrasp) {
            objectState.graspedBy = selectedArm;
            objectState.state = "grasped";
            objectState.position = {
              x: toolPos.x,
              y: toolPos.y,
              z: Math.max(0, toolPos.z - 20),
            };
            manipulation.successfulGrasps += 1;
            manipulation.wasGrasped = true;
            event.grasped = true;
            event.objectId = objectState.objectId;
          } else {
            event.grasped = false;
            event.graspMissed = true;
          }
        } else {
          if (objectState.graspedBy === selectedArm) {
            objectState.graspedBy = null;
            objectState.state = "released";
            objectState.position.z = 0;
            manipulation.wasReleased = true;
            manipulation.releasePosition = { ...objectState.position };

            const matchedZone = targetZones.find(
              (z) =>
                objectState.position.x >= z.x &&
                objectState.position.x <= z.x + z.w &&
                objectState.position.y >= z.y &&
                objectState.position.y <= z.y + z.h,
            );
            if (matchedZone) {
              manipulation.placedInZoneId = matchedZone.zoneId;
              manipulation.targetZoneDistance = 0;
            } else {
              manipulation.placedInZoneId = null;
              let minD = Infinity;
              for (const z of targetZones) {
                const dx = Math.max(0, z.x - objectState.position.x, objectState.position.x - (z.x + z.w));
                const dy = Math.max(0, z.y - objectState.position.y, objectState.position.y - (z.y + z.h));
                const d = Math.round(Math.hypot(dx, dy));
                if (d < minD) minD = d;
              }
              manipulation.targetZoneDistance = Number.isFinite(minD) ? minD : null;
            }

            event.released = true;
            event.objectId = objectState.objectId;
            event.releasePosition = { ...objectState.position };
            event.placedInZoneId = manipulation.placedInZoneId;
            event.targetZoneDistance = manipulation.targetZoneDistance;
          }
        }
        event.objectState = { ...objectState, position: { ...objectState.position } };
      } else if (type === "home") {
        const arm = typed.arm ?? selectedArm;
        if (arm !== "left" && arm !== "right") throw new BadRequestException("home requires arm or preceding arm.select.");
        armPositions[arm] = { x: 0, y: 0, z: 0 };
        event.arm = arm;
        event.symbolic = "home";
      } else if (type === "preview.move_xyz") {
        const position = typed.position as Record<string, unknown> | null;
        if (
          typed.mode !== "learning_preview" ||
          typed.frame !== "learning_preview_v1" ||
          (typed.arm !== "left" && typed.arm !== "right") ||
          !position ||
          ![position.x, position.y, position.z].every(Number.isInteger)
        ) {
          throw new BadRequestException("preview.move_xyz is malformed.");
        }
        armPositions[typed.arm] = { x: position.x as number, y: position.y as number, z: position.z as number };
        learningPreviewPosition = { frame: "learning_preview_v1", arm: typed.arm, x: position.x as number, y: position.y as number, z: position.z as number };
        Object.assign(event, { mode: "learning_preview", frame: "learning_preview_v1", arm: typed.arm, position: learningPreviewPosition });

        if (objectState.graspedBy === typed.arm) {
          objectState.position = {
            x: position.x as number,
            y: position.y as number,
            z: Math.max(0, (position.z as number) - 20),
          };
          if ((position.z as number) >= liftMinZ) {
            manipulation.wasLifted = true;
            objectState.state = "carried";
          }
        }
        event.objectState = { ...objectState, position: { ...objectState.position } };
      } else {
        throw new BadRequestException(`Schematic engine does not support RobotProgram action '${String(type)}'.`);
      }
      timeline.push(event);
    }
    return {
      schemaVersion: 1,
      engineVersion: "vista-schematic-1",
      robotProgramVersionId,
      timeline,
      finalState: {
        selectedArm,
        grippers,
        learningPreviewPosition,
        objectState: { ...objectState, position: { ...objectState.position } },
        manipulation: { ...manipulation, releasePosition: manipulation.releasePosition ? { ...manipulation.releasePosition } : null },
        targetZones: targetZones.map((z) => ({ ...z })),
      },
      warnings,
    };
  }
}

