import { BadRequestException, Injectable } from "@nestjs/common";

export interface SchematicArtifact { schemaVersion: 1; engineVersion: "vista-schematic-1"; robotProgramVersionId: string; timeline: Array<Record<string, unknown>>; finalState: { selectedArm: "left" | "right" | null; grippers: Record<"left" | "right", "open" | "closed">; learningPreviewPosition: { frame: "learning_preview_v1"; arm: "left" | "right"; x: number; y: number; z: number } | null }; warnings: string[]; }

/** Deterministic symbolic interpreter. It intentionally has no physics, IK,
 * collision, trajectory, reachability, wall-clock timing, or hardware output. */
@Injectable()
export class SchematicEngineService {
  render(robotProgram: unknown, robotProgramVersionId: string): SchematicArtifact {
    if (!robotProgram || typeof robotProgram !== "object") throw new BadRequestException("Program version has malformed RobotProgram IR.");
    const value = robotProgram as Record<string, unknown>;
    if (value.kind !== "robot_program" || value.schemaVersion !== 1 || !Array.isArray(value.steps)) throw new BadRequestException("Program version is not canonical RobotProgram IR version 1.");
    let selectedArm: "left" | "right" | null = null; let atMs = 0;
    const grippers: Record<"left" | "right", "open" | "closed"> = { left: "open", right: "open" };
    let learningPreviewPosition: SchematicArtifact["finalState"]["learningPreviewPosition"] = null;
    const timeline: Array<Record<string, unknown>> = []; const warnings: string[] = [];
    for (let index = 0; index < value.steps.length; index += 1) {
      const step = value.steps[index]; if (!step || typeof step !== "object") throw new BadRequestException(`RobotProgram step ${index} is malformed.`);
      const typed = step as Record<string, unknown>; const type = typed.type;
      const event: Record<string, unknown> = { index, atMs, type };
      if (type === "arm.select") { if (typed.arm !== "left" && typed.arm !== "right") throw new BadRequestException("arm.select requires left or right arm."); selectedArm = typed.arm; event.selectedArm = selectedArm; }
      else if (type === "wait") { if (!Number.isInteger(typed.durationMs) || (typed.durationMs as number) < 0 || (typed.durationMs as number) > 60000) throw new BadRequestException("wait requires durationMs between 0 and 60000."); event.durationMs = typed.durationMs; atMs += typed.durationMs as number; }
      else if (type === "gripper.open" || type === "gripper.close") { if (!selectedArm) throw new BadRequestException(`${type} requires a preceding arm.select.`); grippers[selectedArm] = type === "gripper.open" ? "open" : "closed"; event.arm = selectedArm; event.gripper = grippers[selectedArm]; }
      else if (type === "home") { const arm = typed.arm ?? selectedArm; if (arm !== "left" && arm !== "right") throw new BadRequestException("home requires arm or preceding arm.select."); event.arm = arm; event.symbolic = "home"; }
      else if (type === "preview.move_xyz") {
        const position = typed.position as Record<string, unknown> | null;
        if (typed.mode !== "learning_preview" || typed.frame !== "learning_preview_v1" || (typed.arm !== "left" && typed.arm !== "right") || !position || ![position.x, position.y, position.z].every(Number.isInteger)) throw new BadRequestException("preview.move_xyz is malformed.");
        learningPreviewPosition = { frame: "learning_preview_v1", arm: typed.arm, x: position.x as number, y: position.y as number, z: position.z as number };
        Object.assign(event, { mode: "learning_preview", frame: "learning_preview_v1", arm: typed.arm, position: learningPreviewPosition });
      }
      else { throw new BadRequestException(`Schematic engine does not support RobotProgram action '${String(type)}'.`); }
      timeline.push(event);
    }
    return { schemaVersion: 1, engineVersion: "vista-schematic-1", robotProgramVersionId, timeline, finalState: { selectedArm, grippers, learningPreviewPosition }, warnings };
  }
}
