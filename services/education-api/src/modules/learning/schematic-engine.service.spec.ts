import { BadRequestException } from "@nestjs/common";
import { SchematicEngineService } from "./schematic-engine.service";

const program = { kind: "robot_program", schemaVersion: 1, steps: [{ type: "arm.select", arm: "left" }, { type: "gripper.close" }, { type: "wait", durationMs: 200 }, { type: "arm.select", arm: "right" }, { type: "home" }, { type: "gripper.open" }] };
describe("SchematicEngineService", () => {
  const engine = new SchematicEngineService();
  it("renders deterministic symbolic left/right state and wait ordering", () => {
    const first = engine.render(program, "version-1"); const second = engine.render(program, "version-1");
    expect(first).toEqual(second); expect(first.timeline.map((step) => step.type)).toEqual(["arm.select", "gripper.close", "wait", "arm.select", "home", "gripper.open"]);
    expect(first.timeline[3].atMs).toBe(200); expect(first.finalState.grippers).toEqual({ left: "closed", right: "open" });
  });
  it("rejects malformed or unsupported IR rather than guessing physics semantics", () => {
    expect(() => engine.render({ kind: "robot_program", schemaVersion: 1, steps: [{ type: "move_to" }] }, "v1")).toThrow(BadRequestException);
    expect(() => engine.render({ kind: "robot_program", schemaVersion: 1, steps: [{ type: "gripper.open" }] }, "v1")).toThrow(BadRequestException);
    expect(() => engine.render({ schemaVersion: 1 }, "v1")).toThrow(BadRequestException);
  });
  it("records a preview coordinate declaration without treating it as physical motion", () => {
    const result = engine.render({ kind: "robot_program", schemaVersion: 1, steps: [{ type: "arm.select", arm: "left" }, { type: "preview.move_xyz", mode: "learning_preview", frame: "learning_preview_v1", arm: "left", position: { x: 240, y: 220, z: 120 } }] }, "v1");
    expect(result.finalState.learningPreviewPosition).toEqual({ frame: "learning_preview_v1", arm: "left", x: 240, y: 220, z: 120 });
  });
});
